import { Section } from "@/components/ui/Section";
import { MEASUREMENTS } from "@/lib/demo/metrics";
import { moduleName } from "@/lib/demo/system";
import { ArchitectureExplorer } from "./ArchitectureExplorer";

/** The typed dependency graph, explorable at member and module scale, with a table as its text alternative. */
export function Architecture() {
  const rows = [...MEASUREMENTS.values()].sort((a, b) => b.level - a.level);
  return (
    <Section
      id="architecture"
      title="The whole structure, at every scale."
      lede="Files, symbols and modules form one typed graph. Group it by module to see the boundaries, filter relationships by kind, and zoom into any member."
    >
      <ArchitectureExplorer />
      <details className="table-alternative mt-8">
        <summary>Read the graph as a table</summary>
        <div className="mt-4 overflow-x-auto">
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
        </div>
      </details>
    </Section>
  );
}
