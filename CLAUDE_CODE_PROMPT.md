# Mission : construire le template scaffold-hbar « Attested RWA » de bout en bout

Tu es un ingénieur senior full-stack spécialisé Hedera. Tu vas d'abord vérifier sur le testnet que l'architecture est faisable, puis construire, tester et documenter un **template scaffold-hbar** complet, soumis au Scaffold-HBAR Template Bounty d'Hedera. La date limite de soumission est le **dimanche 4 octobre 2026, 23:59 ET**. Le livrable est un dépôt public qu'un développeur instancie en une commande :

```
npm create scaffold-hbar@latest --template <org>/attested-rwa
```

Ce n'est pas un produit, c'est un **point de départ réutilisable** : un exemple complet et fonctionnel que d'autres développeurs forkeront pour émettre leurs propres actifs. Chaque décision doit servir ce but : clarté, réutilisabilité, fiabilité.

---

## 0. Lecture obligatoire avant d'écrire une seule ligne

Lis intégralement, dans cet ordre :

1. `PRD.md` : la spécification. Elle fait autorité sur le périmètre.
2. `.harness/prds/01-foundation.md` à `04-docs-polish.md` : les quatre incréments, chacun avec sa checklist d'acceptation numérotée. Ce sont tes critères de réussite.
3. La section 3 de ce prompt : les **tests de faisabilité** que tu exécuteras toi-même en premier, avant de construire quoi que ce soit. Leurs résultats (`spikes/REPORT.md`, `spikes/findings.json`) **primeront sur le PRD** là où ils le contredisent. Si ces fichiers existent déjà (tests faits lors d'une session précédente), lis-les et ne refais que les tests marqués `FAIL`, `PARTIAL` ou `UNVERIFIED`.
4. `docs/PROTOCOL_VISION.md` : la vision long terme. **Hors périmètre.** Ne l'implémente pas ; tu la lieras seulement depuis le README.
5. Le brief officiel du bounty : https://hedera.com/blog/scaffold-hbar-template-bounty/ (seuil d'éligibilité et grille de notation).
6. La documentation d'auteur de templates scaffold-hbar et le dépôt `hedera-dev/scaffold-hbar` : format exact de `template.json`, structure attendue, fichiers obligatoires, manière dont les templates communautaires sont instanciés. **Ne devine pas le schéma de `template.json` : lis-le.**
7. Le dépôt `hedera-dev/hedera-skills`, en particulier les skills `validate-submission`, `hackathon-prd` et `harness-spec-anatomy`.

Ensuite, fais-moi un résumé de 10 lignes de ta compréhension du projet et passe directement à la phase de faisabilité (section 3). Le plan de construction viendra **après** les tests, car il en dépend.

---

## 1. Règles absolues

1. **Testnet uniquement.** Aucun endpoint, compte ou clé mainnet. Jamais.
2. **Aucun secret commité.** `.gitignore` en place au premier commit : `.env`, `.env.local`, `.demo-keys.json`, clés, dossiers de build. Avant chaque commit, cherche des motifs de clés privées dans le diff (`git diff --cached`) et bloque si tu en trouves. Fournis un `.env.example` complet, sans valeurs réelles.
3. **Ne jamais déclarer un succès non vérifié.** Une étape on-chain est réussie seulement si l'état final est confirmé via le mirror node. Chaque case cochée d'une checklist d'acceptation doit reposer sur une commande que tu as réellement exécutée, dont tu cites la sortie ou le lien.
4. **Ne jamais inventer** d'adresse de contrat, d'ID Hedera, de signature de fonction, de champ de `template.json` ou d'endpoint d'API. Sources : `spikes/findings.json`, docs officielles, dépôts officiels. Si l'info manque, cherche-la ou demande-moi.
5. **Pas de proxy, pas de diamond, pas de DELEGATECALL** (bug testnet connu sur les appels programmés).
6. **Licence MIT.** Aucun code copié depuis un dépôt sous licence incompatible (Uniswap v4 est en BUSL : n'y touche pas). Les interfaces officielles Hedera sont OK, avec attribution.
7. **Anglais** pour tout le code, les commentaires, les messages de commit et la documentation du dépôt. Tes rapports à moi sont en **français**.
8. **Budget HBAR.** Vérifie le solde de l'opérateur avant chaque série d'opérations on-chain. Sous 50 HBAR, arrête-toi et demande-moi de recharger.
9. **Trois tentatives maximum** par problème bloquant. Ensuite, documente ce que tu as essayé et viens me voir avec des options.
10. **Ne publie rien sans moi.** Pas de création de dépôt GitHub public, pas de push, pas de soumission au bounty sans mon accord explicite.

---

## 2. Invariants d'architecture (ne jamais les casser)

Écris-les aussi dans `AGENTS.md`, section « Invariants ».

- Le token d'actif est créé **sans admin key**. Son jeu de clés est immuable.
- **Supply key = `ThresholdKey(THRESHOLD sur ATTESTERS)`** des clés des attesteurs. Aucun autre chemin de mint n'existe.
- Le mint passe **toujours** par un `ScheduleCreate(TokenMint)` signé attesteur par attesteur.
- **KYC key et pause key = contrat `AssetRegistry`.** Aucun KYC n'est accordé avant `finalize()`.
- Avant d'enregistrer un token, l'application **vérifie son jeu de clés sur le mirror node** et refuse tout écart.
- Chaque étape du cycle de vie d'un actif est **journalisée sur le topic HCS** de l'actif.
- Le compte gardien est un compte natif avec `ThresholdKey(2 sur 3)`, pas un contrat multisig.
- Les attesteurs sont derrière l'interface `evaluate(asset) → { approve, evidenceHash, evidence }`. Ajouter un type d'attesteur = un fichier.
- Sans `.env`, l'application démarre et toutes les routes répondent 200 avec un message qui explique la configuration.

---

## 3. Phase de faisabilité : les tests de démarrage (obligatoires, avant tout le reste)

Avant d'écrire la moindre ligne du template, tu vérifies sur le **testnet Hedera** que les quatre paris techniques de l'architecture tiennent. Ce sont des scripts jetables dans `spikes/`, dont le seul but est de produire des **preuves** : des transactions réelles, vérifiées sur le mirror node, et une décision claire pour chaque pari. Tout le reste du projet dépend de ces résultats.

Règles propres à cette phase, en plus de la section 1 :
- Un test est `PASS` uniquement si l'état final est vérifié via le mirror node, pas seulement via un reçu de transaction. Sinon : `UNVERIFIED`.
- Codes de statut Hedera notés **exactement** (ex. `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`), jamais paraphrasés.
- Adresses SaucerSwap, interfaces des system contracts, format de l'appel HIP-755 : uniquement depuis la doc et les dépôts officiels, **URL source notée**.

### Mise en place

1. Vérifie Node ≥ 20.18.3. Crée un dossier `spikes/` avec un `package.json` TypeScript, exécutable avec `npx tsx`.
2. Dépendances : `@hashgraph/sdk`, `ethers` (v6), `dotenv`, `solc` ou Hardhat minimal pour compiler les petits contrats de test. Récupère les interfaces des system contracts (HTS à `0x167`, Schedule Service à `0x16b`) depuis les dépôts officiels `hashgraph/hedera-smart-contracts` ou `hiero-ledger/hiero-contracts`, en notant le commit utilisé.
3. Demande-moi mon `OPERATOR_ID` et `OPERATOR_KEY` de testnet si ils ne sont pas dans `.env`. Indique-moi quel type de clé tu attends (ECDSA recommandé).
4. Configuration réseau à vérifier dans la doc Hedera avant usage : client SDK testnet, relais JSON-RPC Hashio testnet (chain ID 296), mirror node testnet (`/api/v1/`).
5. Écris `spikes/lib/` avec des helpers partagés : création de comptes ECDSA financés (avec alias EVM et associations automatiques), requêtes mirror node avec attente de propagation (le mirror node a quelques secondes de retard : réessaie avec un délai, jusqu'à ~30 s), conversion ID Hedera ↔ adresse EVM, et génération de liens HashScan testnet.
6. Crée les comptes de test une seule fois et réutilise-les entre spikes via `spikes/.keys.json` :
   - `issuer` (émetteur, trésorerie du token)
   - `attester1`, `attester2`, `attester3` (clés **ECDSA secp256k1**, obligatoire pour S3)
   - `investor` (vérifié) et `outsider` (jamais vérifié)
   - financement modeste : quelques HBAR chacun, davantage pour `issuer` et `investor` qui paieront la liquidité et les swaps.

**Ordre d'exécution : S2 → S4 → S3 → S1.** S1 est le plus risqué mais il réutilise les apprentissages des autres.

---

### S2 — Supply key à seuil + mint programmé signé un par un

**Question :** le réseau refuse-t-il de minter tant que le quorum d'attesteurs n'a pas signé, et exécute-t-il le mint automatiquement au k-ième ?

1. Crée un token fongible, supply finie, 2 décimales : trésorerie = `issuer`, **supply key = KeyList à seuil 2 sur 3** des clés publiques de `attester1..3`, **pas d'admin key**. Pour l'instant, KYC key et pause key = clé de l'opérateur (S4 testera la version contrat).
2. Crée un `ScheduleCreateTransaction` contenant un `TokenMintTransaction` de 1 000 000 unités, avec une expiration **longue (24 h)** et `waitForExpiry = false`. Note si l'expiration longue est acceptée (HIP-423) ou refusée.
3. Signe avec `attester1` via `ScheduleSignTransaction`. Vérifie via le mirror node : schedule **non exécuté**, supply totale = 0.
4. Signe avec `attester2`. Vérifie : schedule **exécuté**, supply totale = 1 000 000, détenue par `issuer`.
5. Vérifie sur le mirror node que la supply key du token est bien une threshold key (seuil 2, 3 clés) et que l'admin key est absente.
6. **S2b, optionnel si le budget le permet :** répète la création de token avec des threshold keys de 7 clés (seuil 5) et 15 clés (seuil 11). Note seulement si la création réussit et la taille de transaction. Ça me dira si des comités plus grands sont possibles.

**PASS si** les étapes 3, 4 et 5 sont vérifiées sur le mirror node.
**Repli si FAIL :** supply key = contrat qui compte les approbations on-chain.

---

### S4 — Un contrat comme KYC key et pause key

**Question :** un smart contract peut-il détenir la KYC key et la pause key d'un token HTS, et accorder le KYC / mettre en pause via le system contract HTS ?

1. Écris et déploie un contrat minimal `KycPauseProbe.sol` (pas de proxy) avec `grantKyc(token, account)`, `revokeKyc(token, account)`, `pause(token)`, `unpause(token)`, qui appellent le system contract HTS. Seul le déployeur peut les appeler. Chaque fonction doit remonter le code de réponse HTS (revert avec le code si différent de SUCCESS).
2. Crée un token de test : trésorerie `issuer`, **KYC key = ID du contrat**, **pause key = ID du contrat**, supply key = opérateur, pas d'admin key. Mint un petit montant.
3. Associe `investor` au token si nécessaire. Appelle `grantKyc(token, investor)`. Vérifie via le mirror node le `kyc_status` d'`investor` pour ce token.
4. Transfère des parts de `issuer` à `investor` : doit réussir. Transfère vers `outsider` (associé mais sans KYC) : doit échouer avec `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`. Note le code exact.
5. Appelle `pause(token)`. Vérifie `pause_status = PAUSED` sur le mirror node, puis qu'un transfert échoue avec le code attendu. Appelle `unpause(token)` et vérifie le retour à la normale.
6. Note le gas consommé par chaque appel.

**PASS si** KYC, transfert refusé à `outsider`, pause et dépause sont vérifiés sur le mirror node.
**Repli si FAIL :** clés détenues par un compte serveur, documenté comme hypothèse de confiance.

---

### S3 — Signature d'un schedule depuis un « wallet EVM » (HIP-755)

**Question :** un attesteur peut-il ajouter sa signature à un schedule avec un simple wallet EVM (type MetaMask), sans outil natif Hedera ?

On simule MetaMask avec `ethers` : un wallet construit à partir de la clé privée ECDSA de l'attesteur, qui envoie une transaction Ethereum standard via le relais Hashio. C'est exactement ce que ferait MetaMask.

1. Consulte l'interface officielle du Schedule Service (IHRC755 / `IHederaScheduleService`) et la documentation HIP-755 pour déterminer **exactement** comment un EOA appelle `signSchedule()` (sur quelle adresse, avec quels paramètres). Note la source.
2. Crée un nouveau token avec supply key à seuil 2 sur 3 (comme S2) et un nouveau schedule de mint.
3. Fais signer `attester1` via le SDK natif (comme S2).
4. Fais signer `attester2` **uniquement via ethers + Hashio** en appelant `signSchedule()`. Vérifie via le mirror node que la signature a été ajoutée et que le schedule s'est exécuté (supply > 0).
5. Si l'appel échoue, capture le revert, la réponse du relais, et l'enregistrement de la transaction sur le mirror node (`/contracts/results/...`), puis essaie la variante documentée avec `signSchedule(address, bytes signatureMap)` si elle s'applique.

**PASS si** le schedule s'exécute grâce à une signature envoyée uniquement par ethers.
**Repli si FAIL :** mode démo avec signatures SDK côté serveur uniquement, documenté.

---

### S1 — Token avec KYC key dans un pool SaucerSwap V2 (le plus important)

**Question :** peut-on créer un pool SaucerSwap V2 pour un token dont la KYC key est activée, y ajouter de la liquidité, et faire swapper un investisseur vérifié, tout en bloquant les comptes non vérifiés ?

#### Préparation
1. Lis la documentation développeur de SaucerSwap (https://docs.saucerswap.finance, en particulier `llms.txt`, « Contract deployments », les guides V2 liquidité et swap, et la FAQ sur les tokens à custom fees). Relève les **adresses testnet** officielles de : la factory V2, le NonfungiblePositionManager, le routeur de swap, le quoter, et le contrat WHBAR. Note l'URL source de chaque adresse.
2. Relève aussi le montant et la forme des **frais de création de pool** sur le testnet, et si l'API REST testnet nécessite une clé.

#### Passe A — KYC key tenue par l'opérateur (la plus simple)
3. Crée un token de test : trésorerie `issuer`, KYC key = opérateur, pause key = opérateur, pas d'admin key, pas de custom fees. Mint 1 000 000 unités.
4. Accorde le KYC à `issuer` et `investor`.
5. Crée un pool V2 token/WHBAR (ou token/HBAR selon ce que la doc impose) avec un palier de frais standard. Si la création de pool échoue, note le code exact.
6. Ajoute de la liquidité depuis `issuer`. **Si ça échoue avec `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`**, identifie quel compte a refusé le token, en inspectant les actions/enregistrements enfants de la transaction sur le mirror node (`/api/v1/contracts/results/{txHash}/actions` ou équivalent). Convertis l'adresse EVM en ID Hedera, accorde-lui le KYC (et l'association si nécessaire), et réessaie. Répète jusqu'à trouver l'**ensemble minimal** de contrats SaucerSwap qui doivent avoir le KYC (pool, position manager, routeur...). Note la liste exacte.
7. `investor` swappe des HBAR contre des parts via le routeur. Vérifie via le mirror node le transfert du pool vers `investor`.
8. Contrôle négatif : un swap qui enverrait des parts à `outsider` doit échouer. Note le code exact et où il apparaît.
9. Contrôle pause : mets le token en pause, vérifie qu'un swap échoue et note le code, puis dépause.

#### Passe B — KYC key tenue par le contrat (seulement si S4 est PASS)
10. Refais les étapes 3 à 7 avec la KYC key et la pause key tenues par `KycPauseProbe`, les KYC accordés via le contrat, pour confirmer que le montage final du PRD fonctionne de bout en bout.

#### Si la passe A échoue définitivement
11. Essaie rapidement la même chose sur **SaucerSwap V1** (AMM à produit constant) et note le résultat : c'est un repli intermédiaire.
12. Si V1 échoue aussi, documente précisément le blocage (quel contrat, quel code, à quelle étape). Le repli du brief sera une intégration en lecture seule ou sur fork du mainnet ; ne l'implémente pas, décris seulement ce qui serait nécessaire.

**PASS si** l'étape 7 est vérifiée sur le mirror node, avec la liste minimale des contrats à KYC-er.
**PARTIAL si** ça ne marche qu'en V1, ou seulement en passe A.

---

### Livrables de la phase

- `spikes/s2-threshold-mint.ts`, `spikes/s4-contract-keys.ts`, `spikes/s3-hip755-sign.ts`, `spikes/s1-saucerswap-kyc.ts` : un script par test, relançable, avec des logs lisibles.
- `spikes/contracts/KycPauseProbe.sol`.
- `spikes/findings.json` : toutes les données réutilisables pour le template (adresses et sources, liste minimale des contrats SaucerSwap à KYC-er, codes d'erreur observés, gas mesurés, tailles de threshold key testées, format exact de l'appel HIP-755).
- `spikes/REPORT.md`, **en français** : tableau récapitulatif (test, statut, décision, HBAR consommés), détail et preuves par test, section « Impact sur le PRD », section « Questions ouvertes » pour l'AMA Hedera du 29 septembre.

### Décision go / no-go

À la fin de la phase, applique cette grille et écris la décision en tête de `spikes/REPORT.md` :

| Situation | Décision |
|---|---|
| S1, S2, S4 `PASS` (S3 peu importe) | **GO** : architecture du PRD conservée. Si S3 échoue, le mode wallet est retiré et documenté. |
| S2 ou S4 `FAIL` | **GO avec repli** : applique le repli du PRD §10 pour ce test et liste les lignes du PRD modifiées. |
| S1 `PARTIAL` (V1 seulement, ou passe A seulement) | **GO avec repli** : intégration sur ce qui fonctionne, limite documentée dans le README. |
| S1 `FAIL` en V2 **et** en V1 | **STOP** : l'intégration écosystème principale (35 points) est compromise. Ne construis rien. Viens me voir avec le diagnostic précis et deux ou trois options. |

Puis **arrête-toi** et montre-moi : le tableau récapitulatif, la décision, et la section « Impact sur le PRD ». Tu ne passes à la construction qu'avec mon feu vert.

Une fois le feu vert donné, écris `docs/BUILD_PLAN.md` : les écarts entre PRD et résultats des tests et comment tu les tranches, et ton plan par incrément. Les incréments utilisent les comptes, adresses et formats validés dans `spikes/findings.json`, sans les redécouvrir.

---

## 4. Point de départ

Ne pars pas d'un dossier vide. Génère un projet avec la CLI officielle à partir du template le plus proche (probablement `hedera-native` ; vérifie dans le catalogue), étudie sa structure, puis fais-la évoluer. Ton template doit ressembler à un template officiel : mêmes conventions, même outillage, mêmes scripts. Retire proprement tout ce qui ne sert pas ton cas d'usage.

Initialise git, fais un premier commit propre, puis **un commit par étape logique**, en Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

Crée un `CLAUDE.md` minimal qui renvoie vers `AGENTS.md` comme source de vérité pour les agents, pour que les deux restent synchronisés.

---

## 5. Boucle de travail par incrément

Pour chacun des incréments 01 → 04, dans l'ordre :

1. **Relis** le fichier de l'incrément et les passages du PRD concernés.
2. **Implémente** le périmètre, rien de plus. Si tu identifies un besoin hors périmètre, note-le dans `docs/BUILD_PLAN.md` sous « Idées reportées » au lieu de le coder.
3. **Teste localement** : tests unitaires des contrats (Hardhat), tests des adaptateurs d'attesteurs, lint, typecheck, build.
4. **Exécute sur le testnet** chaque critère d'acceptation on-chain. Pour chaque transaction, récupère le lien HashScan et vérifie l'état via le mirror node.
5. **Consigne les preuves** dans `docs/TESTNET_VERIFICATION.md` : un tableau étape → transaction → lien HashScan → requête mirror node → résultat observé.
6. **Coche la checklist** de l'incrément dans un fichier `docs/ACCEPTANCE.md`, critère par critère, avec la preuve associée (sortie de commande ou lien). Un critère non prouvé reste décoché.
7. **Vérifie la non-régression** : toutes les checklists des incréments précédents doivent toujours passer.
8. **Commit**, puis envoie-moi un rapport court en français : ce qui est fait, preuves clés, écarts, décisions prises, prochaines étapes.

Si le harness Hedera (`hedera-dev/hedera-harness`) est installé sur ma machine, utilise ses validateurs en complément à la fin de chaque incrément. Sinon, ta propre vérification suffit ; ne perds pas de temps à l'installer sans me demander.

---

## 6. Exigences de qualité

La qualité du code vaut 20 points et la documentation 30. Le brief pénalise explicitement le code généré sans soin. Donc :

- **Petit et lisible.** Pas d'abstraction spéculative, pas de fichier géant, pas de couche inutile. Un contrat par responsabilité. Un helper par opération Hedera dans `packages/hedera`.
- **Typage strict** TypeScript, pas de `any` non justifié.
- **Erreurs lisibles.** Crée une table de correspondance des codes de statut Hedera (`ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN`, `TOKEN_IS_PAUSED`, `INVALID_SIGNATURE`, etc.) vers des messages clairs, affichés dans l'UI avec le code d'origine.
- **Aucun** `TODO`, `console.log` de debug, code mort, export inutilisé, fichier d'exemple oublié. Ajoute une règle de lint pour les attraper.
- **Commentaires utiles uniquement** : pourquoi, pas quoi. Chaque endroit qui exploite une particularité Hedera (threshold key, schedule, KYC key tenue par un contrat, HIP-755) mérite un commentaire qui explique le choix.
- **UI sobre et claire.** Une interface qui raconte l'histoire du cycle de vie d'un actif, avec un sélecteur « Act as » en mode démo et un bouton « Run the full story » qui enchaîne toutes les étapes avec leurs liens HashScan. Pas de décoration superflue.

---

## 7. Documentation (30 points : traite-la comme du produit)

Le README doit permettre à un développeur qui ne connaît ni le projet ni Hedera d'avoir l'application qui tourne, sans poser une seule question. Structure :

1. Le problème en 3 phrases, la solution en 3 phrases.
2. **Quickstart en 60 secondes** : prérequis (versions), commande de scaffold, obtention d'un compte testnet et de HBAR de faucet, `.env`, `yarn seed:demo`, lancement.
3. Tableau des variables d'environnement.
4. Diagramme d'architecture en **Mermaid**.
5. Le cycle de vie d'un actif, étape par étape.
6. **« Why this needs Hedera »** : le tableau du PRD §4.
7. **« Who are the attesters? »** : tableau des cas réutilisables (réserves de stablecoin, obligations, parts de fonds, crédits carbone, reçus d'entrepôt, actions de startup, factures, art), avec qui signe et ce qui est émis dans chaque cas. Précise que les attesteurs sont les parties de confiance que chaque projet a déjà.
8. Intégrations écosystème : pourquoi SaucerSwap V2 et IPFS sont indispensables.
9. Tableau de correspondance avec la grille du bounty (PRD §9).
10. Hypothèses de confiance, limites connues, et avertissement : **le token ne confère aucun titre juridique, ce n'est pas un conseil juridique**.
11. « Going further » avec lien vers `docs/PROTOCOL_VISION.md`.

Et aussi :
- `AGENTS.md` : carte du dépôt, commandes, invariants, comment ajouter un attesteur, un paramètre, un type d'actif.
- `docs/ARCHITECTURE.md`, `docs/ADAPTING.md` (avec chemins de fichiers exacts : changer l'attesteur, les métadonnées de l'actif, la paire d'échange), `docs/TESTNET_VERIFICATION.md`.

---

## 8. Test du seuil d'éligibilité (avant de déclarer quoi que ce soit terminé)

Écris `scripts/gate-check.sh` qui reproduit exactement ce que fera le jury, puis exécute-le :

1. Instancie le template **depuis zéro** dans un dossier temporaire, avec la commande officielle. Vérifie dans la doc de la CLI si un chemin local ou une branche est accepté ; sinon, demande-moi de pousser une branche privée pour tester.
2. `install`, `lint`, `build` : doivent passer sans erreur **ni avertissement bloquant**.
3. Démarre l'application **sans `.env`** : toutes les routes principales doivent répondre 200.
4. Vérifie la présence et la validité de `template.json`, `README.md`, `AGENTS.md`, `LICENSE` (MIT).
5. Recherche de secrets dans tout le dépôt (motifs de clés privées ECDSA/ED25519, fichiers `.env` commités, `.demo-keys.json`).
6. Vérifie qu'au moins une transaction testnet est prouvée par un lien dans la documentation.

Exécute ensuite le skill `validate-submission` de hedera-skills s'il est disponible, et joins sa scorecard à ton rapport. Pour chaque point faible qu'il remonte, corrige ou explique pourquoi tu ne le fais pas.

---

## 9. Points d'arrêt : viens me voir quand

- La phase de faisabilité est terminée : tableau récapitulatif, décision go / no-go, impact sur le PRD.
- `docs/BUILD_PLAN.md` est prêt (avant de coder le template).
- Tu as besoin de mes identifiants testnet, d'une clé de pinning IPFS, ou d'une recharge de HBAR.
- Un résultat contredit `spikes/REPORT.md` ou rend un invariant intenable.
- Un problème résiste à trois tentatives.
- Chaque incrément est terminé (rapport court).
- Le `gate-check.sh` passe intégralement : on prépare ensemble la publication et la soumission.

Entre ces points, travaille en autonomie.

---

## 10. Définition de « terminé »

- `spikes/REPORT.md` contient la décision go / no-go et chaque test a un statut vérifié.
- Les quatre checklists d'acceptation sont cochées dans `docs/ACCEPTANCE.md`, chaque critère avec sa preuve.
- `scripts/gate-check.sh` passe depuis un scaffold neuf.
- `docs/TESTNET_VERIFICATION.md` contient un lien pour : déploiement, seed, soumission, création du token, chaque signature du schedule, mint, finalize, création du pool, swap, pause, dépause.
- Le README est suivable de bout en bout par quelqu'un qui découvre le projet.
- Aucun secret, aucun `TODO`, aucun code mort.
- Un rapport final en français : récapitulatif, scorecard `validate-submission`, limites connues, et ce que tu améliorerais avec plus de temps.

Je préfère un template plus petit qui passe le seuil de façon irréprochable à un template ambitieux qui casse sur un scaffold neuf. En cas de doute entre ajouter une fonctionnalité et fiabiliser l'existant, fiabilise.
