import React from "react";
import { withStyles } from "@material-ui/core/styles";
import { ScaleLine } from "ol/control";
import { Paper, Tooltip } from "@material-ui/core";

const styles = (theme) => {
  return {
    scaleLine: {
      "& .ol-scale-line": {
        position: "static",
        right: "inherit",
        bottom: "inherit",
        padding: "3px",
        background: theme.palette.background.paper,
        boxShadow: theme.shadows[4],
        borderRadius: theme.shape.borderRadius,
      },
      "& .ol-scale-line-inner": {
        cursor: "default",
        borderColor: theme.palette.text.primary,
        color: theme.palette.text.primary,
        fontSize: "0.7em",
        lineHeight: "1.5em",
      },
    },
    scaleBadge: {
      padding: "0 4px",
      color: theme.palette.text.primary,
      fontSize: "0.7em",
      lineHeight: "25px",
      borderRadius: theme.shape.borderRadius,
      cursor: "default",
    },
  };
};

class ScaleLineControl extends React.PureComponent {
  state = {
    scale: 0,
  };

  constructor(props) {
    super(props);
    this.ref = React.createRef();
  }

  componentDidUpdate() {
    // Important condition, to ensure that we don't add new ScaleLine and Binds each time value changes
    if (this.props.map && this.ref.current.children.length === 0) {
      // Set initial value of scale
      this.setState({
        scale: this.formatScale(this.getScale()),
      });

      // Add ScaleLine
      const scaleLineControl = new ScaleLine({
        target: this.ref.current,
      });
      this.props.map.addControl(scaleLineControl);

      // Add custom scale bar with numbers (e.g. 1:1000)
      // Bind change event to update current scale
      this.props.map.getView().on("change:resolution", () => {
        this.setState({
          scale: this.formatScale(this.getScale()),
        });
      });
    }
  }

  /**
   * Get current map sclae
   * @instance
   * @return {number} map scale
   */
  getScale() {
    const dpi = 25.4 / 0.28,
      mpu = this.props.map.getView().getProjection().getMetersPerUnit(),
      inchesPerMeter = 39.37,
      res = this.props.map.getView().getResolution();

    return res * mpu * inchesPerMeter * dpi;
  }

  /**
   * Format scale
   * @instance
   * @param {number} scale
   * @return {string} formatted
   */
  formatScale(scale) {
    return Math.round(scale)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  renderScaleBadge() {
    const { classes } = this.props;
    return (
      <Tooltip title="Nuvarande skala">
        <Paper elevation={4} className={classes.scaleBadge}>
          1:{this.state.scale}
        </Paper>
      </Tooltip>
    );
  }

  render() {
    const { classes } = this.props;
    return (
      <>
        <div ref={this.ref} className={classes.scaleLine} />
        {this.renderScaleBadge()}
      </>
    );
  }
}

export default withStyles(styles)(ScaleLineControl);
