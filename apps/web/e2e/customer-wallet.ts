type Listener = (...args: unknown[]) => void;
type RpcRequest = { method: string; params?: unknown[] };

export class EthereumProvider {
  accounts: string[] = [];
  chainId = 31337;
  session: object | undefined;
  private listeners = new Map<string, Listener[]>();
  private pendingConnect?: (error: Error) => void;
  private approveConnection?: () => void;
  private changeAccount?: EventListener;
  events = { removeAllListeners: () => this.listeners.clear(), setMaxListeners: () => {} };
  signer = {
    abortPairingAttempt: () => {
      this.pendingConnect?.(new Error("Wallet checkout was cancelled"));
      this.pendingConnect = undefined;
      this.removeBrowserListeners();
    },
    cleanupPendingPairings: async () => {},
  };

  static async init() { return new EthereumProvider(); }

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...this.listeners.get(event) ?? [], listener]);
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  private removeBrowserListeners() {
    if (this.approveConnection) window.removeEventListener("giveflow:test:wallet-connect", this.approveConnection);
    if (this.changeAccount) window.removeEventListener("giveflow:test:wallet-account", this.changeAccount);
  }

  async connect() {
    this.emit("display_uri", `wc:${"11".repeat(32)}@2?relay-protocol=irn&symKey=${"22".repeat(32)}`);
    await new Promise<void>((resolve, reject) => {
      this.pendingConnect = reject;
      this.approveConnection = () => {
        this.accounts = ["0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"];
        this.session = {};
        this.pendingConnect = undefined;
        window.removeEventListener("giveflow:test:wallet-connect", this.approveConnection!);
        this.changeAccount = (event) => {
          this.accounts = [(event as CustomEvent<string>).detail];
          this.emit("accountsChanged", this.accounts);
        };
        window.addEventListener("giveflow:test:wallet-account", this.changeAccount);
        resolve();
      };
      window.addEventListener("giveflow:test:wallet-connect", this.approveConnection);
    });
  }

  async request({ method, params }: RpcRequest) {
    window.dispatchEvent(new CustomEvent("giveflow:test:wallet-request", { detail: method }));
    const response = await fetch("http://127.0.0.1:8546", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await response.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
  }

  async disconnect() {
    this.session = undefined;
    this.accounts = [];
    this.removeBrowserListeners();
    this.emit("disconnect");
    window.dispatchEvent(new Event("giveflow:test:wallet-disconnected"));
  }
}

export default EthereumProvider;