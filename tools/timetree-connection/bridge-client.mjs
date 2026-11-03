const ROOT =
  "https://pm-aidan-maximization.maxim-mdnservices.workers.dev/api/integrations/timetree-bridge";
export function createBridgeClient(token, fetcher = fetch) {
  if (!/^[-_A-Za-z0-9]{43}$/.test(token))
    throw new Error("Invalid pairing key");
  async function post(path, body) {
    const response = await fetcher(ROOT + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? "Pairing revoked. Pair Windows again in HARDBOND."
          : "HARDBOND could not accept this connection check.",
      );
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  return {
    poll: () => post("/poll", { version: "0.2.0" }),
    complete: (requestId, observation, eventResponseShapes) =>
      post("/result", {
        requestId,
        observation,
        report: { eventResponseShapes },
      }),
  };
}
