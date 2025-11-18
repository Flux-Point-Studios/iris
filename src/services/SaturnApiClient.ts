import CONFIG from '../config';
import axios, { AxiosInstance } from 'axios';

type SaturnDatumDefinition = {
    fields?: any;
    cborExample?: string;
    txExamples?: string[];
};

export type SaturnAmmDefinitions = {
    scripts: {
        mainnet: {
            orderScriptAddress?: string;
            orderScriptHash?: string;
            cancelScriptHash?: string;
            depositScriptHash?: string;
            withdrawScriptHash?: string;
            zapScriptHash?: string;
        }
    };
    datums: {
        swapOrder?: SaturnDatumDefinition;
        deposit?: SaturnDatumDefinition;
        withdraw?: SaturnDatumDefinition;
        zap?: SaturnDatumDefinition;
        cancelRedeemer?: SaturnDatumDefinition & { hex?: string };
    };
    fees?: {
        protocolFeeBps?: number;
        batcherFeeAda?: number;
        tokenProjectFeeBps?: number;
    };
    launch?: {
        mainnetStartSlot?: number;
    };
    poolId?: {
        format?: string; // e.g., "unitA-unitB" or UUID
    };
};

export type SaturnPoolDto = {
    id: string; // UUID or canonical pair id
    assetA: { unit: string };
    assetB: { unit: string };
    reserveA?: string | number;
    reserveB?: string | number;
    feePercent?: number;
};

export type SaturnQuoteRequest = {
    poolId?: string;
    assetA?: string;
    assetB?: string;
    direction: 'in' | 'out';
    swapInAmount?: number;
    swapOutAmount?: number;
    slippageBps?: number;
};

export type SaturnQuoteResponse = {
    expectedReceive?: number;
    expectedOut?: number;
    minReceive?: number;
    priceImpactPercent?: number;
    pool?: SaturnPoolDto;
};

export class SaturnApiClient {
    private readonly baseUrl: string;
    private readonly http: AxiosInstance;

    constructor(baseUrl: string = CONFIG.SATURN_API_BASE) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.http = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
        });
    }

    public isConfigured(): boolean {
        return !!this.baseUrl;
    }

    public async getAmmDefinitions(): Promise<SaturnAmmDefinitions> {
        const { data } = await this.http.get('/v1/aggregator/amm/definitions');
        return data as SaturnAmmDefinitions;
    }

    public async getPools(): Promise<SaturnPoolDto[]> {
        const { data } = await this.http.get('/v1/aggregator/pools');
        return data as SaturnPoolDto[];
    }

    public async getPoolById(id: string): Promise<SaturnPoolDto> {
        const { data } = await this.http.get(`/v1/aggregator/pools/${encodeURIComponent(id)}`);
        return data as SaturnPoolDto;
    }

    public async getPoolByQuery(idOrPair: string): Promise<SaturnPoolDto> {
        const { data } = await this.http.get('/v1/aggregator/pools/by-pool', {
            params: { id: idOrPair, poolId: idOrPair },
        });
        return data as SaturnPoolDto;
    }

    public async getOrderbook(assetUnit: string): Promise<any> {
        const { data } = await this.http.get('/v1/aggregator/orderbook', {
            params: { asset: assetUnit },
        });
        return data;
    }

    public async quote(body: SaturnQuoteRequest): Promise<SaturnQuoteResponse> {
        const { data } = await this.http.post('/v1/aggregator/amm/quote', body);
        return data as SaturnQuoteResponse;
    }
}

export const saturnApiClient: SaturnApiClient = new SaturnApiClient();


