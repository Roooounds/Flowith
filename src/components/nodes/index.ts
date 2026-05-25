import BossNodeComponent from "./BossNodeComponent";
import DecisionNodeComponent from "./DecisionNodeComponent";
import OutputNodeComponent from "./OutputNodeComponent";
import SwitchNodeComponent from "./SwitchNodeComponent";
import LoopNodeComponent from "./LoopNodeComponent";

export const nodeTypes = {
  bossNode: BossNodeComponent,
  decisionNode: DecisionNodeComponent,
  switchNode: SwitchNodeComponent,
  loopNode: LoopNodeComponent,
  outputNode: OutputNodeComponent,
};

export { BossNodeComponent, DecisionNodeComponent, SwitchNodeComponent, LoopNodeComponent, OutputNodeComponent };
