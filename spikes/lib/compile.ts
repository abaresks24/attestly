// Minimal solc wrapper for the spike probe contracts.
import solc from "solc";
import { readFileSync } from "node:fs";

export interface Compiled {
  abi: unknown[];
  bytecode: string;
}

export function compile(solPath: string, contractName: string): Compiled {
  const source = readFileSync(solPath, "utf8");
  const fileName = solPath.split("/").pop()!;
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((e: any) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: any) => e.formattedMessage).join("\n"));
  const artifact = output.contracts[fileName][contractName];
  return { abi: artifact.abi, bytecode: artifact.evm.bytecode.object };
}
