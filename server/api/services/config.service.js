import fs from "fs";
import path from "path";
import ad from "./activedirectory.service";
import asyncFilter from "../utils/asyncFilter";
import log4js from "log4js";

const logger = log4js.getLogger("service.config");

class ConfigService {
  constructor() {
    // TODO: As reading files is expansive, we can read all
    // JSON files on init and keep then in-memory. Subsequent
    // reads will be served from this in-memory store.
    // We should also implement an update-store method, perhaps
    // have a global bus (using EventEmitter?), so we can trigger
    // re-reads from FS into our in-memory store.
    logger.trace("Initiating ConfigService");
  }

  /**
   * @summary Get contents of a map configuration as JSON object, if AD is active
   * a check will be made to see if specified user has access to the map.
   *
   * @param {String} map Name of the map configuration
   * @param {String} user User name that must have explicit access to the map
   * @param {boolean} washContent If true, map config will be examinated and
   * only those layers/groups/tools that user has access to will be returned.
   * @returns Map config contents in JSON
   * @memberof ConfigService
   */
  async getMapConfig(map, user, washContent = true) {
    try {
      const pathToFile = path.join(process.cwd(), "App_Data", `${map}.json`);
      const text = await fs.promises.readFile(pathToFile, "utf-8");
      const json = await JSON.parse(text);

      // If we haven't enabled AD restrictions, just return the entire map config
      if (process.env.AD_LOOKUP_ACTIVE !== "true") {
        logger.trace("[getMapConfig] Getting %s map config", map);
        return json;
      }

      logger.trace(
        "[getMapConfig] Attempting to get %s for user %s",
        map,
        user
      );
      // Else, it looks like MapService is configured to respect AD restrictions.
      // We must do some extra work and remove layers that current user should
      // see before we can return the contents of map config.

      // First, ensure that we have a valid user name. This is necessary for AD lookups.
      if ((await ad.isUserValid(user)) !== true) {
        const e = new Error(
          "[getMapConfig] AD authentication is active, but no valid user name was supplied. Access restricted."
        );
        logger.error(e.message);
        throw e;
      }

      // Restrictions can be placed on either map config (access to map), layers/groups
      // or as a combination of both.

      // First, let's see if user has access to the map config. If not, there's no
      // need to further "wash" groups/layers, so we do it first.

      // Grab the options from map config
      const visibleForGroups = json.tools.find(
        (t) => t.type === "layerswitcher"
      ).options?.visibleForGroups;

      // First see if access to the map config is allowed for group that current user is a member of
      if (Array.isArray(visibleForGroups) && visibleForGroups.length > 0) {
        logger.trace(
          "[getMapConfig] Access to %s is allowed only for the following groups: %o. \nChecking if %s is member in any of them…",
          map,
          visibleForGroups,
          user
        );

        for (const group of visibleForGroups) {
          const isMember = await ad.isUserMemberOf(user, group);

          logger.trace(
            "[getMapConfig] Is %s? member of %s? %o ",
            user,
            group,
            isMember
          );

          // "Wash" the contents of map config given current user's group membership and return the results
          if (isMember === true)
            return washContent ? await this.washMapConfig(json, user) : json;
        }

        // If we got this far, it looks as the current user isn't member in any
        // of the required groups - hence no access can be given to the map.
        const e = new Error(
          `[getMapConfig] ${user} is not member in any of the necessary groups. \nAccess to map restricted.`
        );

        logger.warn(e);

        throw e;
      } else {
        // It looks as the map config itself has no restrictions.
        // There can still be restrictions inside specific tools and layers though,
        // so let's "wash" the response before returning.
        return washContent ? await this.washMapConfig(json, user) : json;
      }
    } catch (error) {
      return { error };
    }
  }

  /**
   * @summary Determine whether a specified user has access to an object.
   *
   * @param {Array} visibleForGroups List of groups that have access, or empty if access unrestricted
   * @param {*} user User ID
   * @param {*} identifier Some ID of the entity to be filtered (e.g. tool name or layer ID). Used for meaningful logging.
   * @returns {boolean}
   * @memberof ConfigService
   */
  async filterByGroupVisibility(visibleForGroups, user, identifier) {
    if (!Array.isArray(visibleForGroups) || visibleForGroups.length === 0) {
      // If no restrictions are set, allow access
      logger.trace(
        "[filterByGroupVisibility] Access to %s unrestricted",
        identifier
      );
      return true;
    } else {
      // There are tools restrictions.
      logger.trace(
        "[filterByGroupVisibility] Only the following groups have access to layer %s: %o",
        identifier,
        visibleForGroups
      );

      // See if user is member of any of the specified groups.
      for (const group of visibleForGroups) {
        const isMember = await ad.isUserMemberOf(user, group);

        // If membership found, return true - no need to keep looping
        if (isMember === true) {
          logger.trace(
            "[filterByGroupVisibility] Access to %s gained for user %o",
            identifier,
            user
          );
          return true;
        }
      }
    }

    // If we got this far restrictions are set but user isn't member
    // in any of the specified groups.
    logger.debug(
      "[filterByGroupVisibility] Access to %s not allowed for user %o",
      identifier,
      user
    );

    return false;
  }

  async washMapConfig(mapConfig, user) {
    // Helper function that will call itself recursively.
    // Necessary to handle the nested tree of groups from LayerSwitcher config.
    const recursivelyWashGroups = async (groups) => {
      // Expect that we got an array of objects, and we must take
      // a look into each one of them separately.
      for (const group of groups) {
        // Notice that we modify the groups array in place!
        // Each group can have layers, take care of them. Remove any layers
        // to which user lacks access.
        group.layers = await asyncFilter(
          // Overwrite the previous value of layers property with return value
          group.layers, // Array to be modified
          async (layer) =>
            await this.filterByGroupVisibility(
              layer.visibleForGroups,
              user,
              `layer "${layer.id}"`
            )
        );

        // Now, recursively take care of groups
        group.groups = await recursivelyWashGroups(group.groups);
      }

      return groups;
    };

    logger.trace("[washMapConfig] Washing map config for %s", user);

    // Each map tool can have restrictions
    mapConfig.tools = await asyncFilter(
      mapConfig.tools,
      async (tool) =>
        await this.filterByGroupVisibility(
          tool.options.visibleForGroups,
          user,
          `plugin "${tool.type}"`
        ) // Call the predicate
    );

    // Find out where LayerSwitcher config is in the tools array, so that we can
    // put it back in place when we're done
    const lsIndexInTools = mapConfig.tools.findIndex(
      (t) => t.type === "layerswitcher"
    );
    let { baselayers, groups } = mapConfig.tools[lsIndexInTools].options;

    // Wash baselayers
    baselayers = await asyncFilter(
      baselayers,
      async (baselayer) =>
        await this.filterByGroupVisibility(
          baselayer.visibleForGroups,
          user,
          `baselayer "${baselayer.id}"`
        )
    );

    // Put back the washed baselayers into config
    mapConfig.tools[lsIndexInTools].options.baselayers = baselayers;

    // Take care of recursively washing groups too, and put back the results to config
    groups = await recursivelyWashGroups(groups);
    mapConfig.tools[lsIndexInTools].options.groups = groups;

    return mapConfig;
  }

  async getLayersStore(user) {
    logger.trace("[getLayersStore] for user %o", user);
    try {
      const pathToFile = path.join(process.cwd(), "App_Data", `layers.json`);
      const text = await fs.promises.readFile(pathToFile, "utf-8");
      const json = await JSON.parse(text);

      // TODO:
      // /config/layers should be way smarter than it is today. We should modify client
      // so that we fetch mapconfig and layers at the same time. This way, we would be
      // able to find out which layers are necessary to be returned from the store for
      // current map. This would obviously lead to drastically smaller response, but
      // also be a security measure, as user would not be able to find out which layers
      // exist in the store.

      // If we haven't enabled AD restrictions, just return the entire layers store
      if (process.env.AD_LOOKUP_ACTIVE !== "true") {
        logger.trace(
          "[getLayersStore] AD auth disabled. Returning the entire contents of layers store."
        );
        return json;
      }

      // Else, it looks like MapService is configured to respect AD restrictions.
      // We must do some extra work and remove layers that current user should
      // see before we can return the contents of map config.

      // First, ensure that we have a valid user name. This is necessary for AD lookups.
      if ((await ad.isUserValid(user)) !== true) {
        const e = new Error(
          "[getLayersStore] AD authentication is active, but no valid user name was supplied. Cannot continue."
        );
        logger.error(e.message);
        throw e;
      }

      // TODO: replace with something like:
      // return this.washLayersStore(json);
      return json;
    } catch (error) {
      return { error };
    }
  }

  /**
   * @summary Export baselayers, groups, and layers from a map configuration
   * to the specified format (currently only JSON is supported, future options
   * could include e.g. XLSX).
   *
   * @param {string} [map="layers"] Name of the map to be explained
   * @param {string} [format="json"] Desired output format
   * @param {*} next Callback, contain error object
   * @returns Human-friendly description of layers used in the specified map
   * @memberof ConfigService
   */
  async exportMapConfig(map = "layers", format = "json", user, next) {
    // Obtain layers definition as JSON. It will be needed
    // both if we want to grab all available layers or
    // describe a specific map config.
    const layersConfig = await this.getLayersStore(user);

    // Create a Map, indexed with each map's ID to allow
    // fast lookup later on
    const layersById = new Map();

    // Populate the Map so we'll have {layerId: layerCaption}
    for (const type in layersConfig) {
      layersConfig[type].map((layer) =>
        layersById.set(layer.id, {
          name: layer.caption,
          ...(layer.layers &&
            layer.layers.length > 1 && { subLayers: layer.layers }),
        })
      );
    }

    // If a list of all available layers was requested, we're
    // done here and can return the Map.
    if (map === "layers") return Object.fromEntries(layersById); // TODO: Perhaps sort on layer name?

    // If we got this far, we now need to grab the contents of
    // the requested map config.
    const mapConfig = await this.getMapConfig(map, user);

    // Some clumsy error handling
    if (mapConfig.error) {
      next(mapConfig.error);
      return;
    }

    // Grab LayerSwitcher's setup
    const { groups, baselayers } = mapConfig.tools.find(
      (tool) => tool.type === "layerswitcher"
    ).options;

    // Define a recursive function that will grab contents
    // of a group (and possibly all groups beneath).
    const decodeGroup = (group) => {
      const g = {};
      // First grab current group's name
      if (group.name) g.name = group.name;

      // Next assign names to all layers
      if (Array.isArray(group.layers))
        g.layers = group.layers.map((l) => layersById.get(l.id));

      // Finally, go recursive if there are subgroups
      if (group.groups && group.groups.length !== 0) {
        g.groups = group.groups.map((gg) => decodeGroup(gg));
      }

      return g;
    };

    // Prepare the object that will be returned
    const output = {
      baselayers: [],
      groups: [],
    };

    // Grab names for base layers and put into output
    baselayers.map((l) => output.baselayers.push(layersById.get(l.id)));

    // Take all groups and call our decode method on them
    output.groups = groups.map((group) => decodeGroup(group));

    if (format === "json") return output;

    // Throw error if output is not yet implemented
    next(Error(`Output format ${format} is not implemented.`));
  }

  /**
   * @summary List all available map configurations files
   *
   * @returns
   * @memberof ConfigService
   */
  async getAvailableMaps() {
    logger.trace("[getAvailableMaps] invoked");
    try {
      const dir = path.join(process.cwd(), "App_Data");
      // List dir contents, the second parameter will ensure we get Dirent objects
      const dirContents = await fs.promises.readdir(dir, {
        withFileTypes: true,
      });
      const availableMaps = dirContents
        .filter(
          (entry) =>
            // Filter out only files (we're not interested in directories).
            entry.isFile() &&
            // Filter out the special case, layers.json file.
            entry.name !== "layers.json" &&
            // Only JSON files
            entry.name.endsWith(".json")
        )
        // Create an array using name of each Dirent object, remove file extension
        .map((entry) => entry.name.replace(".json", ""));
      return availableMaps;
    } catch (error) {
      return { error };
    }
  }

  async getUserSpecificMaps(user) {
    logger.trace("[getUserSpecificMaps] for %o", user);
    try {
      // Prepare our return array
      const output = [];

      // Grab all map configs
      const availableMaps = await this.getAvailableMaps();

      // Open each of these map configs to see if it wants to be exposed
      // in MapSwitcher, and to see what name it wishes to have.
      for (const map of availableMaps) {
        // Open map config and parse it to a JSON object. Notice that
        // we getMapConfig will return only those maps that current
        // user has access to, so there's no need to "wash" the result
        // later on.
        //
        // The optional, third, parameter tells getMapConfig not to
        // wash the content (layers/groups/tools). We just need to know
        // if user has access to map as a whole, washing for purpose of
        // this method would introduce unnecessary overhead.
        const mapConfig = await this.getMapConfig(map, user, false);

        // If we encounter errors, access to current map is restricted for current user
        // so let's just continue with next element in available maps.
        if (mapConfig.error) continue;

        // If we got this far, user seems to have access to map config.

        // The relevant settings will be found in LayerSwitcher config
        const lsConfig = mapConfig.tools.find(
          (t) => t.type === "layerswitcher"
        );

        // If map config says is configured to be exposed in MapSwitcher,
        // push the current map into the return object.
        if (lsConfig?.options.dropdownThemeMaps === true) {
          output.push({
            mapConfigurationName: map,
            mapConfigurationTitle: lsConfig.options.themeMapHeaderCaption,
          });
        }
      }
      return output;
    } catch (error) {
      return { error };
    }
  }

  async getAvailableADGroups() {
    try {
      return ad.getAvailableADGroups();
    } catch (error) {
      return { error };
    }
  }

  async findCommonGroupsForUsers(users) {
    try {
      return ad.findCommonGroupsForUsers(users);
    } catch (error) {
      return { error };
    }
  }

  /**
   * @summary Duplicate a specified map
   *
   * @param {*} src Map to be duplicated
   * @param {*} dest Name of the new map, the duplicate
   * @returns
   * @memberof ConfigService
   */
  async duplicateMap(src, dest) {
    try {
      let srcPath = null;

      if (src.endsWith(".template")) {
        // If src ends with ".template", don't add the .json file extension,
        // and look inside /templates directory.
        srcPath = path.join(process.cwd(), "App_Data", "templates", src);
      } else {
        // Else it's a regular JSON file, add the extension and look in App_Data only
        srcPath = path.join(process.cwd(), "App_Data", src + ".json");
      }

      // Destination will always need the extension added
      const destPath = path.join(process.cwd(), "App_Data", dest + ".json");

      // Copy!
      await fs.promises.copyFile(srcPath, destPath);
      // Sending a valid object will turn it into JSON which in turn will return
      // status 200 and that empty object. I know it's not the best way and we
      // should be more explicit about successful returns than just an empty object…
      return {};
    } catch (error) {
      return { error };
    }
  }

  /**
   * @summary Create a new map, using supplied name, but duplicating the default map template
   *
   * @param {*} name Name given to the new map
   * @memberof ConfigService
   */
  async createNewMap(name) {
    return this.duplicateMap("map.template", name);
  }

  /**
   * @summary Delete a map configuration
   *
   * @param {*} name Map configuration to be deleted
   * @memberof ConfigService
   */
  async deleteMap(name) {
    try {
      // Prepare path
      const filePath = path.join(process.cwd(), "App_Data", name + ".json");
      await fs.promises.unlink(filePath);
      return {};
    } catch (error) {
      return { error };
    }
  }
}

export default new ConfigService();
