import { BaseJob } from './BaseJob';
import { saturnApiClient } from '../services/SaturnApiClient';
import { saturnDefinitions } from '../services/SaturnDefinitionProvider';
import { dbService, eventService } from '../indexerServices';
import { EntityManager } from 'typeorm';
import { LiquidityPool } from '../db/entities/LiquidityPool';
import { LiquidityPoolState } from '../db/entities/LiquidityPoolState';
import { Asset, Token } from '../db/entities/Asset';
import { Dex } from '../constants';

export class SaturnRefreshSyntheticStatesJob extends BaseJob {

    public async handle(): Promise<any> {
        if (! saturnApiClient.isConfigured()) {
            return Promise.resolve();
        }
        await saturnDefinitions.ensureLoaded();

        const pools = await saturnApiClient.getPools();
        const nowSlot: number = Math.floor(Date.now() / 1000);

        return dbService.transaction(async (manager: EntityManager) => {
            for (const p of pools) {
                const pool: LiquidityPool | undefined = await manager.findOne(LiquidityPool, {
                    relations: ['tokenA', 'tokenB'],
                    where: {
                        dex: Dex.SaturnSwap,
                        identifier: p.id,
                    },
                }) ?? undefined;

                if (! pool) continue;

                const tokenAUnit: string = p.assetA?.unit ?? 'lovelace';
                const tokenBUnit: string = p.assetB?.unit ?? 'lovelace';

                const tokenA: Token = tokenAUnit === 'lovelace' ? 'lovelace' : Asset.fromId(tokenAUnit);
                const tokenB: Token = tokenBUnit === 'lovelace' ? 'lovelace' : Asset.fromId(tokenBUnit);
                const lpToken: Asset = new Asset('saturn.synthetic', Buffer.from(p.id).toString('hex'));
                lpToken.isLpToken = true;
                lpToken.decimals = 0;

                const state: LiquidityPoolState = LiquidityPoolState.make(
                    Dex.SaturnSwap,
                    saturnDefinitions.scripts.orderScriptAddress ?? '',
                    p.id,
                    tokenA,
                    tokenB,
                    lpToken,
                    Number(p.reserveA ?? 0),
                    Number(p.reserveB ?? 0),
                    0,
                    Number(p.feePercent ?? 0),
                    Number(p.feePercent ?? 0),
                    nowSlot,
                    `saturn:${p.id}:${nowSlot}`,
                    [],
                    [],
                    [],
                );

                state.liquidityPool = pool;

                const saved = await manager.save(state);
                pool.latestState = saved;
                await manager.save(pool);

                eventService.pushEvent({
                    type: 'LiquidityPoolStateCreated',
                    data: saved,
                });
            }
        });
    }
}


