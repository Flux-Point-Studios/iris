import { DefinitionConstr } from '../types';
import { SaturnAmmDefinitions, saturnApiClient } from './SaturnApiClient';
import CONFIG from '../config';

type SaturnScripts = {
    orderScriptAddress?: string;
    orderScriptHash?: string;
    cancelScriptHash?: string;
    depositScriptHash?: string;
    depositScriptAddress?: string;
    withdrawScriptHash?: string;
    withdrawScriptAddress?: string;
    zapScriptHash?: string;
    zapScriptAddress?: string;
};

type SaturnFees = {
    protocolFeeBps?: number;
    batcherFeeAda?: number;
    tokenProjectFeeBps?: number;
};

type SaturnParsedDefinitions = {
    swap?: DefinitionConstr;
    deposit?: DefinitionConstr;
    withdraw?: DefinitionConstr;
    zap?: DefinitionConstr;
    cancelRedeemerHex?: string;
};

export class SaturnDefinitionProvider {
    private _loaded: boolean = false;
    private _scripts: SaturnScripts = {};
    private _fees: SaturnFees = {};
    private _startSlot: number = 0;
    private _poolIdFormat: string | undefined;
    private _parsed: SaturnParsedDefinitions = {};

    public async boot(): Promise<void> {
        if (! saturnApiClient.isConfigured()) {
            this._loaded = false;
            return;
        }
        await this.loadDefinitions();
    }

    public async ensureLoaded(): Promise<void> {
        if (this._loaded) return;
        await this.boot();
    }

    public get scripts(): SaturnScripts {
        return this._scripts;
    }

    public get fees(): SaturnFees {
        return this._fees;
    }

    public get startSlot(): number {
        return this._startSlot;
    }

    public get poolIdFormat(): string | undefined {
        return this._poolIdFormat;
    }

    public getParsed(kind: 'swap' | 'deposit' | 'withdraw' | 'zap'): DefinitionConstr | undefined {
        return this._parsed[kind];
    }

    public getCancelRedeemerHex(): string | undefined {
        return this._parsed.cancelRedeemerHex;
    }

    public setTestDefinitions(input: {
        scripts?: SaturnScripts,
        fees?: SaturnFees,
        startSlot?: number,
        poolIdFormat?: string,
        parsed?: SaturnParsedDefinitions
    }): void {
        if (input.scripts) this._scripts = input.scripts;
        if (input.fees) this._fees = input.fees;
        if (input.startSlot !== undefined) this._startSlot = input.startSlot;
        if (input.poolIdFormat) this._poolIdFormat = input.poolIdFormat;
        if (input.parsed) this._parsed = input.parsed;
        this._loaded = true;
    }

    private async loadDefinitions(): Promise<void> {
        const defs: SaturnAmmDefinitions = await saturnApiClient.getAmmDefinitions();

        this._scripts = defs.scripts?.mainnet ?? {};
        this._fees = defs.fees ?? {};
        this._startSlot = defs.launch?.mainnetStartSlot ?? 0;
        this._poolIdFormat = defs.poolId?.format;

        // Optional: attempt to translate incoming datum JSON to DefinitionConstr.
        // For now, rely on downstream to supply `parsed` via setTestDefinitions if needed.
        // This keeps runtime robust even if Saturn schema evolves.
        this._parsed = {
            cancelRedeemerHex: (defs.datums?.cancelRedeemer as any)?.hex,
        };

        this._loaded = true;
    }
}

export const saturnDefinitions: SaturnDefinitionProvider = new SaturnDefinitionProvider();


