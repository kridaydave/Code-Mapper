declare module "graphology-metrics/centrality/pagerank" {
  import type { AbstractGraph, Attributes } from "graphology-types";

  type PagerankOptions<EdgeAttributes extends Attributes> = {
    nodePagerankAttribute?: string;
    getEdgeWeight?: keyof EdgeAttributes | null;
    alpha?: number;
    maxIterations?: number;
    tolerance?: number;
  };

  type PagerankMapping = { [node: string]: number };

  function pagerank<NodeAttributes extends Attributes = Attributes, EdgeAttributes extends Attributes = Attributes>(
    graph: AbstractGraph<NodeAttributes, EdgeAttributes>,
    options?: PagerankOptions<EdgeAttributes>
  ): PagerankMapping;

  export default pagerank;
}
