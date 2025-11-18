import { BaseAmmDexAnalyzer } from './BaseAmmDexAnalyzer';
import {
    AmmDexOperation,
    DefinitionConstr,
    DefinitionField,
    DatumParameters,
    Transaction,
    Utxo,
} from '../types';
import { Dex, SwapOrderType } from '../constants';
import { saturnDefinitions } from '../services/SaturnDefinitionProvider';
import { DefinitionBuilder } from '../DefinitionBuilder';
import { Data } from 'lucid-cardano';
import { lucidUtils, toDefinitionDatum } from '../utils';
import { Asset, Token } from '../db/entities/Asset';
import { LiquidityPoolSwap } from '../db/entities/LiquidityPoolSwap';
import { LiquidityPoolDeposit } from '../db/entities/LiquidityPoolDeposit';
import { LiquidityPoolWithdraw } from '../db/entities/LiquidityPoolWithdraw';
import { LiquidityPoolState } from '../db/entities/LiquidityPoolState';

export class SaturnSwapAnalyzer extends BaseAmmDexAnalyzer {

    public startSlot: number = 0;

    constructor(app: any) {
        super(app);
        this.startSlot = saturnDefinitions.startSlot || 0;
    }

    public async analyzeTransaction(transaction: Transaction): Promise<AmmDexOperation[]> {
        return Promise.all([
            this.liquidityPoolStates(transaction),
            this.swapOrders(transaction),
            this.depositOrders(transaction),
            this.withdrawOrders(transaction),
            this.cancelledOperationInputs(
                transaction,
                [
                    saturnDefinitions.scripts.orderScriptHash ?? '',
                    saturnDefinitions.scripts.depositScriptHash ?? '',
                    saturnDefinitions.scripts.withdrawScriptHash ?? '',
                    saturnDefinitions.scripts.zapScriptHash ?? '',
                ].filter(Boolean) as string[],
                saturnDefinitions.getCancelRedeemerHex() ?? 'd87a80',
            ),
        ]).then((ops: AmmDexOperation[][]) => ops.flat(2));
    }

    protected liquidityPoolStates(_transaction: Transaction): LiquidityPoolState[] {
        // Saturn has no on-chain pool datum; discovery is via REST.
        return [];
    }

    protected swapOrders(transaction: Transaction): LiquidityPoolSwap[] {
        const def: DefinitionConstr | undefined = saturnDefinitions.getParsed('swap');

        return transaction.outputs.map((output: Utxo) => {
            if (! this.isOrderScript(output.toAddress)) return undefined;
            if (! output.datum || ! def) {
                return this.fallbackSwap(transaction, output);
            }

            try {
                const definitionField: DefinitionField = toDefinitionDatum(
                    Data.from(output.datum)
                );
                const builder: DefinitionBuilder = new DefinitionBuilder(def);
                const datumParameters: DatumParameters = builder.pullParameters(definitionField as DefinitionConstr);

                const [swapInToken, swapInAmount] = this.deriveSwapIn(output, datumParameters);
                const swapOutToken: Token | undefined = datumParameters.SwapOutTokenPolicyId === ''
                    ? 'lovelace'
                    : new Asset(datumParameters.SwapOutTokenPolicyId as string, datumParameters.SwapOutTokenAssetName as string);

                return LiquidityPoolSwap.make(
                    Dex.SaturnSwap,
                    undefined,
                    swapInToken,
                    swapOutToken,
                    Number(swapInAmount),
                    Number(datumParameters.MinReceive ?? 0),
                    Number(saturnDefinitions.fees.batcherFeeAda ?? 0),
                    (datumParameters.SenderPubKeyHash ?? datumParameters.ReceiverPubKeyHash ?? '') as string,
                    (datumParameters.SenderStakingKeyHash ?? datumParameters.ReceiverStakingKeyHash ?? '') as string,
                    transaction.blockSlot,
                    transaction.hash,
                    output.index,
                    output.toAddress,
                    SwapOrderType.Instant,
                    transaction,
                );
            } catch (_e) {
                return this.fallbackSwap(transaction, output);
            }
        }).filter((op: LiquidityPoolSwap | undefined) => op !== undefined) as LiquidityPoolSwap[];
    }

    protected depositOrders(transaction: Transaction): LiquidityPoolDeposit[] {
        const def: DefinitionConstr | undefined = saturnDefinitions.getParsed('deposit');
        return transaction.outputs.map((output: Utxo) => {
            if (! this.isDepositScript(output.toAddress)) return undefined;
            if (! output.datum || ! def) {
                return this.fallbackDeposit(transaction, output);
            }

            try {
                const definitionField: DefinitionField = toDefinitionDatum(
                    Data.from(output.datum)
                );
                const builder: DefinitionBuilder = new DefinitionBuilder(def);
                const datumParameters: DatumParameters = builder.pullParameters(definitionField as DefinitionConstr);

                const [depositAToken, depositAAmount, depositBToken, depositBAmount] = this.deriveDeposit(output, datumParameters);

                return LiquidityPoolDeposit.make(
                    Dex.SaturnSwap,
                    undefined,
                    depositAToken,
                    depositBToken,
                    Number(depositAAmount),
                    Number(depositBAmount),
                    Number(datumParameters.MinReceive ?? 0),
                    Number(saturnDefinitions.fees.batcherFeeAda ?? 0),
                    (datumParameters.SenderPubKeyHash ?? '') as string,
                    (datumParameters.SenderStakingKeyHash ?? '') as string,
                    transaction.blockSlot,
                    transaction.hash,
                    output.index,
                    transaction,
                );
            } catch (_e) {
                return this.fallbackDeposit(transaction, output);
            }
        }).filter((op: LiquidityPoolDeposit | undefined) => op !== undefined) as LiquidityPoolDeposit[];
    }

    protected withdrawOrders(transaction: Transaction): LiquidityPoolWithdraw[] {
        const def: DefinitionConstr | undefined = saturnDefinitions.getParsed('withdraw');
        return transaction.outputs.map((output: Utxo) => {
            if (! this.isWithdrawScript(output.toAddress)) return undefined;
            if (! output.datum || ! def) {
                return this.fallbackWithdraw(transaction, output);
            }

            try {
                const definitionField: DefinitionField = toDefinitionDatum(
                    Data.from(output.datum)
                );
                const builder: DefinitionBuilder = new DefinitionBuilder(def);
                const datumParameters: DatumParameters = builder.pullParameters(definitionField as DefinitionConstr);

                const lpToken: Asset | undefined = output.assetBalances[0]?.asset;
                const lpAmount: bigint = output.assetBalances[0]?.quantity ?? 0n;

                if (! lpToken) return undefined;

                return LiquidityPoolWithdraw.make(
                    Dex.SaturnSwap,
                    undefined,
                    lpToken,
                    Number(lpAmount),
                    Number(datumParameters.MinReceiveA ?? 0),
                    Number(datumParameters.MinReceiveB ?? 0),
                    Number(saturnDefinitions.fees.batcherFeeAda ?? 0),
                    (datumParameters.SenderPubKeyHash ?? '') as string,
                    (datumParameters.SenderStakingKeyHash ?? '') as string,
                    transaction.blockSlot,
                    transaction.hash,
                    output.index,
                    transaction,
                );
            } catch (_e) {
                return this.fallbackWithdraw(transaction, output);
            }
        }).filter((op: LiquidityPoolWithdraw | undefined) => op !== undefined) as LiquidityPoolWithdraw[];
    }

    private scriptHashFromAddress(address: string): string | undefined {
        try {
            return lucidUtils.getAddressDetails(address).paymentCredential?.hash ?? undefined;
        } catch (_e) {
            return undefined;
        }
    }

    private isOrderScript(address: string): boolean {
        const hash = this.scriptHashFromAddress(address) ?? '';
        return (
            hash === (saturnDefinitions.scripts.orderScriptHash ?? '')
            || address === (saturnDefinitions.scripts.orderScriptAddress ?? '')
        );
    }
    private isDepositScript(address: string): boolean {
        const hash = this.scriptHashFromAddress(address) ?? '';
        return (
            hash === (saturnDefinitions.scripts.depositScriptHash ?? '')
            || address === (saturnDefinitions.scripts.depositScriptAddress ?? '')
        );
    }
    private isWithdrawScript(address: string): boolean {
        const hash = this.scriptHashFromAddress(address) ?? '';
        return (
            hash === (saturnDefinitions.scripts.withdrawScriptHash ?? '')
            || address === (saturnDefinitions.scripts.withdrawScriptAddress ?? '')
        );
    }

    private deriveSwapIn(output: Utxo, _params: DatumParameters): [Token, bigint] {
        if (output.assetBalances.length > 0) {
            return [output.assetBalances[0].asset, output.assetBalances[0].quantity];
        }
        const batcherFee: bigint = BigInt(Math.max(Number(saturnDefinitions.fees.batcherFeeAda ?? 0), 0));
        return ['lovelace', output.lovelaceBalance - batcherFee];
    }

    private deriveDeposit(output: Utxo, _params: DatumParameters): [Token, bigint, Token, bigint] {
        const aToken: Token = output.assetBalances.length > 1
            ? output.assetBalances[0].asset
            : 'lovelace';
        const bToken: Token = aToken === 'lovelace'
            ? output.assetBalances[0].asset
            : (output.assetBalances[1]?.asset ?? 'lovelace');
        const aAmount: bigint = aToken === 'lovelace'
            ? output.lovelaceBalance
            : output.assetBalances[0].quantity;
        const bAmount: bigint = aToken === 'lovelace'
            ? (output.assetBalances[0]?.quantity ?? 0n)
            : (output.assetBalances[1]?.quantity ?? 0n);
        return [aToken, aAmount, bToken, bAmount];
    }

    private fallbackSwap(transaction: Transaction, output: Utxo): LiquidityPoolSwap | undefined {
        const [swapInToken, swapInAmount] = this.deriveSwapIn(output, {});
        return LiquidityPoolSwap.make(
            Dex.SaturnSwap,
            undefined,
            swapInToken,
            undefined,
            Number(swapInAmount),
            0,
            Number(saturnDefinitions.fees.batcherFeeAda ?? 0),
            '',
            '',
            transaction.blockSlot,
            transaction.hash,
            output.index,
            output.toAddress,
            SwapOrderType.Instant,
            transaction,
        );
    }

    private fallbackDeposit(transaction: Transaction, output: Utxo): LiquidityPoolDeposit | undefined {
        const [aToken, aAmount, bToken, bAmount] = this.deriveDeposit(output, {});
        return LiquidityPoolDeposit.make(
            Dex.SaturnSwap,
            undefined,
            aToken,
            bToken,
            Number(aAmount),
            Number(bAmount),
            undefined,
            Number(saturnDefinitions.fees.batcherFeeAda ?? 0),
            '',
            '',
            transaction.blockSlot,
            transaction.hash,
            output.index,
            transaction,
        );
    }

    private fallbackWithdraw(transaction: Transaction, output: Utxo): LiquidityPoolWithdraw | undefined {
        if (output.assetBalances.length === 0) return undefined;
        const lpToken: Asset = output.assetBalances[0].asset;
        const lpAmount: bigint = output.assetBalances[0].quantity;
        return LiquidityPoolWithdraw.make(
            Dex.SaturnSwap,
            undefined,
            lpToken,
            Number(lpAmount),
            undefined,
            undefined,
            Number(saturnDefinitions.fees.batcherFeeAda ?? 0),
            '',
            '',
            transaction.blockSlot,
            transaction.hash,
            output.index,
            transaction,
        );
    }
}


