import { createContext, useContext } from "react";
import type { RunnerClient } from "@/lib/ws";

const ClientContext = createContext<RunnerClient | null>(null);

export const ClientProvider = ClientContext.Provider;

export function useRunner(): RunnerClient {
  const client = useContext(ClientContext);
  if (client === null) {
    throw new Error("runner client missing");
  }
  return client;
}
