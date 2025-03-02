import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import { withSnackbar } from "notistack";
import propFilters from "components/FeatureInfo/FeaturePropsFilters";

class FirSearchResultItemView extends React.PureComponent {
  state = {};

  static propTypes = {
    model: PropTypes.object.isRequired,
    app: PropTypes.object.isRequired,
    localObserver: PropTypes.object.isRequired,
    classes: PropTypes.object.isRequired,
  };

  static defaultProps = {};

  constructor(props) {
    super(props);
    this.model = this.props.model;
    this.rootModel = this.props.rootModel;
    this.localObserver = this.props.localObserver;
    this.globalObserver = this.props.app.globalObserver;
    this.propFilters = propFilters;
  }

  getTemplate = () => {
    return this.rootModel.config.resultsList.template;
    // Keep for testing/development
    // return `<div>
    //     <table>
    //       <tbody>
    //         <tr>
    //           <td>Fastighet</td>
    //           <td>{fastbet}</td>
    //         </tr>
    //         <tr>
    //           <td>Område</td>
    //           <td>{omrade}</td>
    //         </tr>
    //         <tr>
    //           <td>Ägare</td>
    //           <td>{namn1}</td>
    //         </tr>
    //         <tr>
    //           <td>Ägare</td>
    //           <td>{namn2}</td>
    //         </tr>
    //         <tr>
    //           <td>Ägare</td>
    //           <td>{namn3}</td>
    //         </tr>
    //         <tr>
    //           <td>Notering ägare</td>
    //           <td>{agare_notering}</td>
    //         </tr>
    //         <tr>
    //           <td>Fastighetsadress</td>
    //           <td>{fastighetsadress}</td>
    //         </tr>
    //         <tr>
    //           <td>Registrerad totalarea (m2)</td>
    //           <td>{totalarea}</td>
    //         </tr>
    //       </tbody>
    //     </table>
    //     <ul>
    //       <li>
    //         <a href="https://fastighetsrapport-utv.varberg.se/Report/Fastighetenkel/pdf/{fnr}" target="_blank">
    //           Fastighetsrapport (förenklad)
    //         </a>
    //       </li>
    //       <li>
    //         <a href="https://fastighetsrapport-utv.varberg.se/Report/Fastighet/pdf/{fnr}" target="_blank">
    //           Fastighetsrapport (komplett)
    //         </a>
    //       </li>
    //       <li>
    //         <a href="https://bygglovsanteckning-utv.varberg.se/?fnr={fnr}&fastighet={fastbet}" target="_blank">
    //           Bygglovsanteckning
    //         </a>
    //       </li>
    //     </ul>
    //   </div>`;
  };

  getHtml = () => {
    const props = this.model.getProperties(); // model is a feature in this case...
    const nbsp = "\u00A0";
    let s = this.getTemplate();
    const regex = /\{[a-zA-Z_0-9|\-()]+\}/gm;
    let m;

    while ((m = regex.exec(s)) !== null) {
      if (m.index === regex.lastIndex) {
        regex.lastIndex++;
      }

      for (let index = 0; index < m.length; index++) {
        const match = m[index];
        let v = this.propFilters.applyFilters(
          props,
          match.replace("{", "").replace("}", "")
        );
        if (v === "") {
          v = nbsp;
        }
        s = s.replace(match, v);
      }
    }

    return s;
  };

  render() {
    const { classes } = this.props;

    return (
      <>
        <div
          className={classes.root}
          dangerouslySetInnerHTML={{ __html: this.getHtml() }}
        ></div>
      </>
    );
  }
}

const styles = (theme) => ({
  root: {
    "& table": {
      borderSpacing: 0,
      width: "100%",
      marginBottom: theme.spacing(2),
      "& tr:nth-child(even) td": {
        backgroundColor: theme.palette.type === "dark" ? "#565656" : "#ececec",
      },
      "& tr td:first-child": {
        fontWeight: 500,
      },
      "& td": {
        verticalAlign: "top",
        padding: "2px 6px",
      },
    },
    "& ul": {
      display: "block",
      listStyle: "none",
      paddingLeft: 0,
      paddingTop: theme.spacing(1),
      "& a": {
        display: "inline-block",
        padding: "2px 0",
      },
    },
  },
});

export default withStyles(styles)(withSnackbar(FirSearchResultItemView));
