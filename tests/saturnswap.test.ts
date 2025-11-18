import { IndexerApplication } from '../src/IndexerApplication';
import { SaturnSwapAnalyzer } from '../src/dex/SaturnSwapAnalyzer';
import { AmmDexOperation, Transaction, Utxo } from '../src/types';
import { LiquidityPoolSwap } from '../src/db/entities/LiquidityPoolSwap';
import { LiquidityPoolDeposit } from '../src/db/entities/LiquidityPoolDeposit';
import { LiquidityPoolWithdraw } from '../src/db/entities/LiquidityPoolWithdraw';
import { Asset } from '../src/db/entities/Asset';
import { saturnDefinitions } from '../src/services/SaturnDefinitionProvider';

describe('SaturnSwap (AMM facade)', () => {
    const app: IndexerApplication = new IndexerApplication();
    const analyzer: SaturnSwapAnalyzer = new SaturnSwapAnalyzer(app);

    beforeAll(async () => {
        await app.cache.boot();
        saturnDefinitions.setTestDefinitions({
            scripts: {
                orderScriptAddress: 'addr1zxn9efv2f6w82hagxqtn62ju4m293tqvw0uhmdl64ch8uw6j2c79gy9l76sdg0xwhd7r0c0kna0tycz4y5s6mlenh8pq6s3z70',
                orderScriptHash: 'saturn_order_hash',
                depositScriptHash: 'saturn_deposit_hash',
                depositScriptAddress: 'addr1wxaptpmxcxawvr3pzlhgnpmzz3ql43n2tc8mn3av5kx0yzs09tqh8',
                withdrawScriptHash: 'saturn_withdraw_hash',
                withdrawScriptAddress: 'addr1wxaptpmxcxawvr3pzlhgnpmzz3ql43n2tc8mn3av5kx0yzs09tqh8',
                zapScriptHash: 'saturn_zap_hash',
                cancelScriptHash: 'saturn_cancel_hash',
            },
            fees: {
                batcherFeeAda: 2000000,
                protocolFeeBps: 30,
            },
            startSlot: 0,
        });
    });

    it('Can index Saturn swap orders (fallback without datum parsing)', async () => {
        const tx: Transaction = {
            hash: 'txhash_saturn_swap_1',
            blockHash: 'blockhash',
            blockSlot: 123,
            inputs: [],
            outputs: [
                {
                    forTxHash: 'txhash_saturn_swap_1',
                    toAddress: saturnDefinitions.scripts.orderScriptAddress!,
                    datum: 'd87a80',
                    index: 0,
                    lovelaceBalance: 3_000_000n,
                    assetBalances: [],
                } as Utxo,
            ],
            references: [],
            fee: 0n,
            mints: [],
            datums: {},
            metadata: undefined,
            redeemers: [],
            scriptHashes: [],
        };
        let operations: AmmDexOperation[];
        operations = await analyzer.analyzeTransaction(tx);
        expect(operations.length).toBeGreaterThanOrEqual(1);
        expect(operations[0]).toBeInstanceOf(LiquidityPoolSwap);
        expect((operations[0] as any).txHash).toEqual(tx.hash);
    });

    it('Can index Saturn deposit orders (fallback without datum parsing)', async () => {
        const tx: Transaction = {
            hash: 'txhash_saturn_deposit_1',
            blockHash: 'blockhash',
            blockSlot: 124,
            inputs: [],
            outputs: [
                {
                    forTxHash: 'txhash_saturn_deposit_1',
                    toAddress: 'addr1wxaptpmxcxawvr3pzlhgnpmzz3ql43n2tc8mn3av5kx0yzs09tqh8',
                    datum: 'd87a80',
                    index: 0,
                    lovelaceBalance: 5_000_000n,
                    assetBalances: [
                        {
                            asset: { policyId: ''.padStart(56, '0'), nameHex: '00' } as Asset,
                            quantity: 1000n,
                        }
                    ],
                } as Utxo,
            ],
            references: [],
            fee: 0n,
            mints: [],
            datums: {},
            metadata: undefined,
            redeemers: [],
            scriptHashes: [],
        };
        let operations: AmmDexOperation[];
        operations = await analyzer.analyzeTransaction(tx);
        const deposit = operations.find((op: any) => op instanceof LiquidityPoolDeposit);
        expect(deposit).toBeDefined();
        expect((deposit as any).txHash).toEqual(tx.hash);
    });

    it('Can index Saturn withdraw orders (fallback without datum parsing)', async () => {
        const tx: Transaction = {
            hash: 'txhash_saturn_withdraw_1',
            blockHash: 'blockhash',
            blockSlot: 125,
            inputs: [],
            outputs: [
                {
                    forTxHash: 'txhash_saturn_withdraw_1',
                    toAddress: 'addr1wxaptpmxcxawvr3pzlhgnpmzz3ql43n2tc8mn3av5kx0yzs09tqh8',
                    datum: 'd87a80',
                    index: 0,
                    lovelaceBalance: 2_000_000n,
                    assetBalances: [
                        {
                            asset: { policyId: ''.padStart(56, '0'), nameHex: '6c702000' } as Asset,
                            quantity: 500n,
                        }
                    ],
                } as Utxo,
            ],
            references: [],
            fee: 0n,
            mints: [],
            datums: {},
            metadata: undefined,
            redeemers: [],
            scriptHashes: [],
        };
        let operations: AmmDexOperation[];
        operations = await analyzer.analyzeTransaction(tx);
        const withdraw = operations.find((op: any) => op instanceof LiquidityPoolWithdraw);
        expect(withdraw).toBeDefined();
        expect((withdraw as any).txHash).toEqual(tx.hash);
    });
});


