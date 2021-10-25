import FmeServerError from "../utils/FmeServerError";
import log4js from "log4js";

const logger = log4js.getLogger("service.fmeServer");

class FmeServerService {
  constructor() {
    if (process.env.FME_SERVER_ACTIVE !== "true") {
      logger.info(
        "FME_SERVER_ACTIVE is set to %o in .env. Not enabling FME-server services.",
        process.env.FME_SERVER_ACTIVE
      );
      return;
    }

    logger.trace("Initiating FmeServerService");

    if (
      process.env.FME_SERVER_USER === undefined ||
      process.env.FME_SERVER_PASSWORD === undefined ||
      process.env.FME_SERVER_BASE === undefined
    ) {
      throw new FmeServerError("Configuration missing");
    }

    // Might be unnecessary, but this let's us check against a "real" object rather
    // than checking if the key in .env is === "true".
    this._serviceActive = true;

    // An object to hold the FME-token information that we use when making requests to the FME-server.
    this._tokenInformation = {
      token: null,
      expirationDate: null,
    };
  }

  _handleServiceNotActive() {
    logger.trace(
      "Attempt to access FME-server functionality – FME-server is disabled in .env"
    );
    throw new FmeServerError(
      "FME-server service is disabled. There is no way to fetch the repositories."
    );
  }

  // _generateNewAccessToken() {
  //   axios
  //     .post(
  //       `${process.env.FME_SERVER_BASE}/fmerest/v3/tokens`,
  //       {
  //         description: `Session token used by Hajkmap. Generated by: ${process.env.FME_SERVER_USER}`,
  //         enabled: true,
  //         expirationTimeout: 3600,
  //         name: "Hajkmap-session-token",
  //         restricted: false,
  //         user: process.env.FME_SERVER_USER,
  //       },
  //       {
  //         auth: {
  //           username: process.env.FME_SERVER_USER,
  //           password: process.env.FME_SERVER_PASSWORD,
  //         },
  //       }
  //     )
  //     .then(function (response) {
  //       console.log(response);
  //     })
  //     .catch(function (error) {
  //       console.log(error);
  //     });
  // }

  _refreshAccessToken() {
    logger.trace(
      "Attempt to access FME-server functionality – FME-server is disabled in .env"
    );
    throw new FmeServerError(
      "FME-server service is disabled. There is no way to fetch the repositories."
    );
  }

  _getAccessTokenStatus() {
    if (!this._tokenInformation.token) {
      return "TOKEN_MISSING";
    }
    if (this._tokenInformation.expirationDate < "date") {
      return "TOKEN_EXPIRED";
    }
    return "TOKEN_VALID";
  }

  async _getValidAccessToken() {
    const tokenStatus = this._getAccessTokenStatus();
    switch (tokenStatus) {
      case "TOKEN_EXPIRED":
        // Update and return refreshed token
        return null;
      case "TOKEN_MISSING":
        //Generate and return a new token
        return null;
      default:
        return this._tokenInformation.token;
    }
  }

  async getRepositories() {
    try {
      if (!this._serviceActive) {
        this._handleServiceNotActive();
      }
      const tokenStatus = this._getAccessTokenStatus();
      if (
        !this._tokenInformation.token ||
        this._tokenInformation.expirationDate
      ) {
      }
      return { test: "hej" };
    } catch (error) {
      return { error };
    }
  }
}

export default new FmeServerService();
