import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { MEASUREMENTS } from "@/lib/demo/metrics";
import { moduleName } from "@/lib/demo/system";
import { ArchitectureExplorer, TableScroller } from "./ArchitectureExplorer";

/**
 * The typed dependency graph, explorable at member and module scale, with a table as its text alternative. The
 * graph of files and symbols ships today; grouping it into modules is inference, planned for v1.
 */
export function Architecture() {
  const rows = [...MEASUREMENTS.values()].sort((a, b) => b.level - a.level);
  return (
    <Section
      id="architecture"
      title="The whole structure, at every scale."
      lede="Katedrala links files and symbols into one typed graph today; inferring the modules within it is planned for v1."
      aside={
        <div className="flex flex-col gap-2">
          <Status status="available" label="Typed graph, available today" />
          <Status status="planned" label="Module inference, planned for v1" />
        </div>
      }
    >
      <ArchitectureExplorer />
      <details className="table-alternative mt-8">
        <summary>Read the graph as a table</summary>
        <TableScroller label="Graph as a table">
          <table className="w-full min-w-[40rem] text-left text-[0.875rem]">
            <thead className="text-ink-faint">
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Module</th>
                <th scope="col">Depends on</th>
                <th scope="col">Depended on by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.node.id}>
                  <th scope="row" className="data font-normal text-ink">
                    {m.node.id}
                  </th>
                  <td>{moduleName(m.node.module)}</td>
                  <td>{m.dependsOn.join(", ") || "nothing"}</td>
                  <td>{m.dependedOnBy.join(", ") || "nothing"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </details>
    </Section>
  );
}
