import { saturnApiClient } from '../src/services/SaturnApiClient';

const RUN_LIVE = process.env.SATURN_LIVE_TESTS === 'true' && !!process.env.SATURN_API_BASE;

(RUN_LIVE ? describe : describe.skip)('SaturnSwap live smoke', () => {
    it('Orderbook returns asks for a known asset', async () => {
        // Asset example must be provided by env for reliability
        const unit = process.env.SATURN_TEST_ASSET_UNIT || 'lovelace';
        const data = await saturnApiClient.getOrderbook(unit);
        expect(data).toBeDefined();
    });

    it('Quote returns expectedOut > 0 for ADA -> asset', async () => {
        const assetB = process.env.SATURN_TEST_ASSET_UNIT || 'lovelace';
        const res = await saturnApiClient.quote({
            assetA: 'lovelace',
            assetB,
            direction: 'in',
            swapInAmount: 2_000_000,
            slippageBps: 50,
        });
        expect(res).toBeDefined();
        expect((res.expectedOut ?? res.expectedReceive ?? 0)).toBeGreaterThan(0);
    });

    it('Pools by id/pair returns pool detail', async () => {
        const pair = process.env.SATURN_TEST_PAIR_ID || 'lovelace-lovelace';
        const pool = await saturnApiClient.getPoolByQuery(pair);
        expect(pool).toBeDefined();
        expect(pool.id).toBeDefined();
    });
});


