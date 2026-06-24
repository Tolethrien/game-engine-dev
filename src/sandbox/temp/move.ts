import Component, { InternalDCProps } from "@/core/dogma/component";

export default class Move extends Component {
  public speed: number;
  constructor(internal: InternalDCProps, obj: { speed: number }) {
    super(internal);
    this.speed = obj.speed;
  }
}
