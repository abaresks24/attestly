# Rapport de faisabilité — Attested RWA (spikes testnet)

**Date d'exécution :** 22 septembre 2026 · Testnet Hedera · Opérateur `0.0.10667593` (ECDSA)

---

## Décision : **GO avec repli**

Les trois piliers Hedera-natifs de l'architecture (S2, S3, S4) passent **sans réserve**. Le pilier écosystème (S1) passe **sur SaucerSwap V1** ; **SaucerSwap V2 est bloqué sur testnet par une misconfiguration de frais de création de pool** (paramètre côté SaucerSwap, sans rapport avec le KYC). On applique le repli du grid : **intégration sur V1, limite V2 documentée**.

> Grille appliquée : « S1 PARTIAL (V1 seulement) → GO avec repli : intégration sur ce qui fonctionne, limite documentée. »

---

## Tableau récapitulatif

| Test | Question | Statut | Décision |
|---|---|---|---|
| **S2** | Supply key à seuil + mint programmé signé un par un | ✅ **PASS** | Conserver tel quel |
| **S4** | Contrat détenant KYC key + pause key via HTS 0x167 | ✅ **PASS** | Conserver tel quel |
| **S3** | Signature d'un schedule depuis un wallet EVM (HIP-755) | ✅ **PASS** | Mode wallet **conservé** |
| **S1** | Token KYC-gaté pool-é et swappé sur SaucerSwap | 🟡 **PARTIAL** | **V1** en venue ; V2 documenté comme limite testnet |

**Consommation HBAR :** opérateur 1000 → 490 HBAR. ~204 HBAR dorment encore dans les comptes de test (récupérables) ; brûlage net ~300 HBAR (frais réseau + 2 frais de pair V1 ~51 HBAR + gas des contrats). Solde très au-dessus du plancher de 50.

Ordre d'exécution suivi : S2 → S4 → S3 → S1 (V2 puis V1).

---

## S2 — Supply key à seuil 2/3 + mint programmé ✅ PASS

Token fongible, supply finie, 2 décimales ; trésorerie = issuer ; **supply key = `ThresholdKey(2 sur 3)`** des clés d'attesteurs ; **pas d'admin key**.

| Étape | Preuve |
|---|---|
| Token créé | [`0.0.10670055`](https://hashscan.io/testnet/token/0.0.10670055) |
| Schedule (expiry **24 h** accepté, HIP-423) | [`0.0.10670056`](https://hashscan.io/testnet/schedule/0.0.10670056) |
| Après **1** signature | `executed_timestamp=null`, `total_supply=0` (mirror) |
| Après **2** signatures | `executed_timestamp=1790106675…`, `total_supply=1000000` chez l'issuer |
| Jeu de clés | supply key décodée (protobuf) = `ThresholdKey(2/3 attesteurs)`, **admin key absente** |

**Conclusion :** le réseau refuse le mint sous quorum et l'exécute automatiquement au k-ième. Expiry long-terme 24 h accepté. `waitForExpiry=false` OK.

---

## S4 — Contrat comme KYC key et pause key ✅ PASS

Contrat non-proxy `KycPauseProbe` détenant KYC key + pause key ; appels au system contract HTS `0x167`.

| Étape | Preuve |
|---|---|
| Contrat déployé | [`0.0.10670108`](https://hashscan.io/testnet/contract/0.0.10670108) (déploiement : 1M gas requis) |
| Token (KYC+pause key = contrat) | [`0.0.10670110`](https://hashscan.io/testnet/token/0.0.10670110) |
| `grantKyc(investor)` via contrat | `kyc_status=GRANTED` (mirror) · gas **40 692** |
| Transfert → investor KYC'd | réussi |
| Transfert → outsider (associé, sans KYC) | refusé **`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`** (176) |
| `pause()` via contrat | `pause_status=PAUSED` · gas **40 147** ; transfert refusé **`TOKEN_IS_PAUSED`** (265) |
| `unpause()` via contrat | transferts repris · gas **40 125** |

**Piège découvert :** HTS `grantTokenKyc(token, account)` exige l'**adresse alias EVM** du compte (keccak de la clé ECDSA = `evm_address` du mirror), **pas** la long-zero dérivée de l'id (sinon `INVALID_ACCOUNT_ID`=15). Le token, lui, se référence en long-zero. Impact template : un `enableAsset()` appelé *par* l'investor utilise `msg.sender` (l'alias) naturellement.

---

## S3 — Signature d'un schedule depuis un wallet EVM (HIP-755) ✅ PASS

| Étape | Preuve |
|---|---|
| Token seuil 2/3 | [`0.0.10670121`](https://hashscan.io/testnet/token/0.0.10670121) |
| Schedule | [`0.0.10670123`](https://hashscan.io/testnet/schedule/0.0.10670123) |
| attester1 signe (SDK natif) | schedule non exécuté |
| attester2 signe **via ethers/Hashio uniquement** | tx `0xef596beb…c229`, schedule **exécuté**, `total_supply=1000000` |

**Forme utilisée :** `IHRC755ScheduleFacade.signSchedule()` appelée sur l'**adresse long-zero du schedule** (sélecteur `0x06d15889`), wallet ethers construit depuis la clé ECDSA brute de l'attesteur. La signature de la transaction Ethereum de l'EOA **est** la signature du schedule. Le mode wallet des attesteurs est donc viable.

---

## S1 — Token KYC-gaté sur SaucerSwap 🟡 PARTIAL

### V2 — BLOQUÉ (misconfiguration testnet, sans rapport avec le KYC)

SaucerSwap V2 testnet a `Factory.poolCreateFee = 1e16` tinycent. Or `tinycent = 1e-10 USD` (source `IExchangeRate.sol`), donc **le frais de création de pool = 1 000 000 USD**. `PoolInitializer.createAndInitializePoolIfNecessary` reverte **`PCF`** tant que `address(this).balance >= tinycentsToTinybars(poolCreateFee)` ≈ **1,28×10¹⁵ tinybar ≈ 12,8 M HBAR**. `Factory.createPool` a le même mur (`require(msg.value >= convTinybar)`).

- **Cause vérifiée par la source** : `saucerswaplabs-v2-core/UniswapV3Factory.sol` + `saucerswaplabs-v2-periphery/base/PoolInitializer.sol`.
- **Unités Hedera** (découverte clé) : sur l'EVM Hedera, `msg.value` **et** `address(this).balance` sont en **tinybars** (1e8/HBAR), pas en weibars ; le relais Hashio divise la valeur ethers (weibar) par 1e10 avant l'appel. (Confirmé : une tx à 0,71 HBAR échoue le check, ce qui serait impossible en interprétation weibar.)
- **Non contournable** : seul le `feeToSetter` du factory peut changer `poolCreateFee`. C'est une différence testnet vs mainnet (~1 USD).

### V1 — PASS (venue retenue)

SaucerSwap V1 (fork UniswapV2), factory `0.0.9959`, router `0.0.19264`. `pairCreateFee = 2e10` tinycent = **2 USD ≈ 25,6 HBAR** (abordable).

| Étape | Preuve |
|---|---|
| Token KYC-gaté | [`0.0.10670521`](https://hashscan.io/testnet/token/0.0.10670521) |
| Pair créée (`factory.createPair`, permissionless) | [`0.0.10670524`](https://hashscan.io/testnet/contract/0.0.10670524) |
| KYC accordé **au pair** | `GRANTED` |
| Liquidité ajoutée (`addLiquidityETH`) | tx `0xe3f1462c…60ed` |
| **Investor vérifié swappe 1 HBAR** | reçoit **45 330 parts** (pool → investor, mirror) |
| **Outsider non vérifié swappe** | **refusé** : HTS renvoie `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` (176) au niveau `0x167` le plus profond |

**Ensemble minimal des contrats à KYC-er : le pair uniquement.** En UniV2, le token circule directement issuer → pair → destinataire ; le router **ne le détient jamais** (son grant a renvoyé `TOKEN_NOT_ASSOCIATED` et est inutile).

**Ordre imposé par le KYC :** créer la pair vide **d'abord** → résoudre l'id de pair (les pairs V1 sont déployées en **CREATE2**, pas en long-zero → résolution via mirror `/contracts/{evm}`) → **accorder le KYC au pair** → ajouter la liquidité. Cela évite le conflit « création+liquidité atomique » vs « KYC avant transfert ».

**Masquage d'erreur (important pour FR-7) :** le `TransferHelper` de SaucerSwap reverte avec **« Safe token transfer failed! »** ; le code HTS réel (176 / 265) n'est visible que dans la trace des actions enfants du mirror.

**Gas :** `createPair` ≈ 9 M (auto-association HTS interne au pair), `addLiquidityETH` ≈ 8 M, swap ≈ 6 M.

---

## Impact sur le PRD

1. **§5 / FR-7 — venue = SaucerSwap V1, pas V2.** La liquidité et les swaps du template passent par V1 (factory `0.0.9959`, router `0.0.19264`). Le câblage V2 et la limite testnet (`poolCreateFee` = $1M) sont **documentés**, pas implémentés comme chemin nominal. À réévaluer si SaucerSwap corrige `poolCreateFee` sur testnet (question AMA).
2. **§3 étape 7 / FR-5→FR-7 — `finalize()` accorde le KYC au *pair*, pas « aux contrats SaucerSwap V2 ».** L'ensemble minimal est réduit au seul pair. Le pair étant CREATE2 (id connu seulement après création), le flux est : issuer crée la pair → l'app résout l'id → `AssetRegistry` (détenteur de la KYC key, cf. S4) accorde le KYC au pair → issuer ajoute la liquidité.
3. **§3 étape 2 — octroi KYC par adresse alias.** Pour tout octroi piloté par une adresse fournie (pas `msg.sender`), utiliser l'alias EVM du compte, pas la long-zero (piège S4).
4. **FR-7 — table d'erreurs.** Ajouter le mapping SaucerSwap « Safe token transfer failed! » → « transfert refusé (KYC non accordé ou token en pause) », avec note que le code HTS brut (176/265) n'apparaît que dans la trace mirror.
5. **§6 / gas.** Les opérations SaucerSwap V1 nécessitent des `gasLimit` élevés (create pair 9M, liquidité 8M, swap 6M) car l'association HTS interne est coûteuse. À câbler dans les helpers.
6. **Mode wallet conservé (S3 PASS).** HIP-755 forme B (`IHRC755ScheduleFacade.signSchedule()` sur l'adresse long-zero du schedule).
7. **Vérification du jeu de clés (invariant / FR-2).** Le mirror renvoie une ThresholdKey en `ProtobufEncoded` opaque ; la vérifier par décodage protobuf (`@hiero-ledger/proto` + `Key._fromProtobufKey`), déjà prototypé dans `lib/keys.ts`.
8. **Résilience réseau.** Les nœuds de consensus testnet renvoient `BUSY`/timeout sous charge ; client SDK avec `maxAttempts` élevé + backoff, et lecture des soldes via mirror plutôt que query consensus.

Aucun invariant d'architecture n'est cassé. Le repli V1 ne touche pas aux clés natives ni au cycle d'attestation ; il change seulement la venue d'échange.

---

## Questions ouvertes (AMA Hedera du 29 septembre)

1. **`poolCreateFee` V2 testnet = $1M** : est-ce une misconfiguration connue ? Sera-t-elle corrigée avant le 4 octobre ? Existe-t-il un moyen sanctionné de créer un pool V2 sur testnet (factory alternatif, endpoint de seed) ?
2. **KYC token sur V2** : au-delà du frais, y a-t-il une contrainte documentée sur les tokens à KYC key dans les pools V2 (au vu du refus des custom-fee tokens) ?
3. **Unités `msg.value`/`balance`** : confirmer que sur l'EVM Hedera testnet `msg.value` et `address(this).balance` sont bien en tinybars (impact sur tout contrat manipulant de la valeur).
4. **Comités plus grands** (S2b, non exécuté par prudence budgétaire) : taille max pratique d'une ThresholdKey pour une supply key (7/15 clés) ?

---

## Notes de reproductibilité

- Comptes de test dans `spikes/.keys.json` (gitignored). Recréables via `yarn accounts`.
- Constantes et adresses sourcées dans `spikes/findings.json`.
- Scripts relançables : `yarn s2` · `yarn s4` · `yarn s3` · `yarn s1` (V2, échoue à la création de pool — attendu) · `tsx s1b-saucerswap-v1.ts` (V1, PASS).
