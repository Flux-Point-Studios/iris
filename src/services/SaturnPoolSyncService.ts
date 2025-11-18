import { BaseService } from './BaseService';
import CONFIG from '../config';
import { saturnApiClient } from './SaturnApiClient';
import { saturnDefinitions } from './SaturnDefinitionProvider';
import { dbService } from '../indexerServices';
import { EntityManager } from 'typeorm';
import { LiquidityPool } from '../db/entities/LiquidityPool';
import { Dex } from '../constants';
import { Asset } from '../db/entities/Asset';

export class SaturnPoolSyncService extends BaseService {
    private _timer: NodeJS.Timer | undefined = undefined;

    boot(): Promise<any> {
        if (! CONFIG.SATURN_POOL_SYNC_ENABLED || ! saturnApiClient.isConfigured()) {
            return Promise.resolve();
        }

        return this.syncOnce()
            .catch(() => Promise.resolve())
            .finally(() => {
                this._timer = setInterval(() => {
                    this.syncOnce().catch(() => Promise.resolve());
                }, CONFIG.SATURN_POOL_SYNC_INTERVAL_SECONDS * 1000);
            });
    }

    async syncOnce(): Promise<void> {
        await saturnDefinitions.ensureLoaded();
        const pools = await saturnApiClient.getPools();

        await dbService.transaction(async (manager: EntityManager) => {
            for (const p of pools) {
                const unitA = p.assetA?.unit ?? '';
                const unitB = p.assetB?.unit ?? '';

                const tokenAIsAda: boolean = unitA === 'lovelace';
                const tokenBIsAda: boolean = unitB === 'lovelace';

                const tokenAAsset: Asset | undefined = tokenAIsAda ? undefined : Asset.fromId(unitA);
                const tokenBAsset: Asset | undefined = tokenBIsAda ? undefined : Asset.fromId(unitB);

                // Normalize to Iris convention: if one side is ADA, put the non-ADA as tokenB
                const finalTokenA: Asset | undefined = (tokenAIsAda || tokenBIsAda)
                    ? undefined
                    : tokenAAsset;
                const finalTokenB: Asset | undefined = (tokenAIsAda || tokenBIsAda)
                    ? (tokenAIsAda ? tokenBAsset! : tokenAAsset!)
                    : tokenBAsset!;

                const identifier: string = p.id || this.canonicalPairId(unitA, unitB);
                const address: string = saturnDefinitions.scripts.orderScriptAddress ?? '';
                const startSlot: number = saturnDefinitions.startSlot || 0;

                let existing: LiquidityPool | undefined = await manager.findOne(LiquidityPool, {
                    relations: ['tokenA', 'tokenB'],
                    where: {
                        dex: Dex.SaturnSwap,
                        identifier: identifier,
                    },
                }) ?? undefined;

                if (existing) {
                    existing.address = address || existing.address;
                    await manager.save(existing);
                    continue;
                }

                const newPool: LiquidityPool = LiquidityPool.make(
                    Dex.SaturnSwap,
                    identifier,
                    address,
                    finalTokenA,
                    finalTokenB!,
                    startSlot,
                );

                await manager.save(newPool);
            }
        });
    }

    private canonicalPairId(unitA: string, unitB: string): string {
        const a = unitA || '';
        const b = unitB || '';
        return [a, b].sort().join('-');
    }
}

export const saturnPoolSync: SaturnPoolSyncService = new SaturnPoolSyncService();


