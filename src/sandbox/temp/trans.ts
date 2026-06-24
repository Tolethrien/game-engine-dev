import Component, { InternalDCProps } from "@/core/dogma/component";

export default class Trans extends Component {
  public vel: number;
  constructor(internal: InternalDCProps, obj: { vel: number }) {
    super(internal);
    this.vel = obj.vel;
  }
}
