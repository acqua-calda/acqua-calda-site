# Hetzner活用検討メモ（2026-09-06時点）

## 背景
- Acqua Caldaのホームページ（このフォルダ）を公開するにあたり、既に契約済みのHetznerを活用できないか検討した。
- Hetznerは以前「なんかのアプリを作る時」に登録。審査がかなり厳しく苦労して通したため、**できれば解約したくない**とのこと。

## 結論：このホームページには不要
- index.html / css / js だけの**静的サイト**なので、サーバー側の処理（DB・ログイン等）が一切ない。
- 無料の静的ホスティング（Cloudflare Pages, GitHub Pages, Netlify など）で十分。費用ゼロ・手間ゼロで公開できる。
- Hetznerを使う場合は、小さいCloud Server（例: CX22, 月数百円）を借りてCaddyなどで配信する形になるが、OS更新等の保守が自分の負担になる。**必須ではないが無駄にはならない**という位置づけ。

## ドメインについて
- ドメイン自体はHetznerを含めどこの会社でも**有料**（年1,000〜3,000円程度）。無料なのはHetzner DNSでの「DNS管理（ゾーン設定）」の部分のみ。
- 無料ホスティングのデフォルトURL（`◯◯.pages.dev` や `◯◯.github.io`）は無料だが、独自ドメイン（`acquacalda.com`等）が欲しい場合は別途購入が必要。

## 「Hetznerで既にドメインを買った記憶がある」件の調査
ユーザーが確認した範囲：
1. **Accounts (accounts.hetzner.com)** → 田の字メニューから各サービスに切り替え可能（Console / Robot / konsoleH / Website）。
2. **konsoleH** を確認 → 「No products yet」で何も登録されていなかった。
3. **Robot (robot.hetzner.com)** を確認 → メニューは Storage Box / Server / Traffic statistics / History / Ordering のみで、ドメイン専用メニューは見当たらず。ここにもドメインらしき登録は確認できなかった。

### 未解決・次のアクション
- **Accounts → Invoices → Transactions** の請求履歴をまだ確認していない。ここでドメイン代の支払いがあったか検索するのが一番確実な最終確認方法。
- konsoleH・Robotどちらにも見当たらなかったため、Hetznerでは実際にはドメインを買っていない（お名前.comやGoogle Domains等、別サービスで購入した記憶と混同している）可能性が高い。

## 今後Hetzner（サーバー）が必要になりそうな場面
- メンバー限定ログインページ、予約フォームの自動返信など**サーバー側の処理**が必要なアプリを作る時
- Discord/LINEの自動応答Botなど、**常時稼働するプログラム**を動かしたい時
- 自分でデータベースやファイルを管理したい（外部サービスに預けたくないデータがある）時
- 無料サービスの制限を超えるアクセス数・カスタム処理が必要になった時

→ 上記のような「アプリ開発」の話が今後サークルで出た場合に、既存のHetzner契約をそのまま活用する方針。

## 追記（2026-09-07）：最終方針決定

- 別プロジェクト「jijiweb.app」用にHetzner Cloud VPSが既に稼働中であることが判明。相乗りできないか検討した。
- 結論：**今回（Aqua Calda）はHetznerを使わない**。静的サイトなので無料ホスティング（Cloudflare Pages / GitHub Pages / Netlify など）で公開する方針に確定。
- 既存VPSへの相乗りは「無料ホスティングで十分」という結論を覆すほどのメリットがなく、見送り。

---

# サイト制作 進捗メモ（2026-09-07 作業分）

## ファイルの保存場所について
- デスクトップ直置きは避けたい方針。おすすめは「ドキュメント\Projects\aqua-calda」等の専用フォルダへ移動。OneDriveに入っていれば自動バックアップはされる。
- より確実な保管方法としてGitHub（gitリポジトリ化）を提案済み。まだ実施はしていない（このフォルダは現時点でgit管理されていない）。

## MEMBERSセクション
- ダミーの3人（RIN/KAI/YU）を廃止し、実際のメンバー2人に変更。
  - **YUU**（ボーカル）：`img/YUU_profile.png` を使用。プロフィール文はまだ本人から未着（「※プロフィール準備中」表記中）。
  - **OZ**（ギター/作詞作曲）：`img/OZ_profile.png` を使用。プロフィール文反映済み（本人の記述の「ムック」→**MUCC**、「造作」→**造詣**は表記として自然な形に補正して掲載）。
- 表示順は左からYUU→OZ。
- [css/style.css](css/style.css) の `.members-grid` を3列想定→2列固定（`repeat(2, 1fr)`, max-width 800px）に変更。
- `.member-photo img` に `object-fit: cover; object-position: top center;` を追加し、顔が切れないよう調整。

## ABOUTセクションの画像
- プレースホルダー枠に `img/Maine.jfft` ではなく `img/Maine.jfif` を設定（バンドの全身/バストアップ系画像）。
- 枠のアスペクト比は4:5（縦長）。用意された画像は820×1024px(比率0.801)でほぼぴったり一致し、クロップの心配なし。
- `.about-frame img { object-fit: cover; }` を追加。

## ネオン風の光る枠（グロー装飾）
- 「背景が真っ黒で寂しい／画像枠を目立たせたい」との要望で、`.about-frame` と `.member-card` に常時発光するシアン/ピンクの枠線＋box-shadowグローを追加（ホバーでさらに強く光る）。

## サイバー演出：ネオンパーティクル背景
- 背景が単調とのフィードバックを受け、全ページ固定のcanvasでシアン/ピンク/パープルの粒子がゆっくり漂い明滅する演出を追加。
  - HTML: `<canvas id="bgParticles" class="bg-particles">` を `body` 先頭付近に追加。
  - CSS: `.bg-particles{ position:fixed; inset:0; z-index:-1; }`（z-index:-1で必ずコンテンツの背面に来るようにしている）。
  - JS: [js/script.js](js/script.js) にcanvas 2D描画のパーティクルシステムを追加。画面サイズに応じた粒子数、`prefers-reduced-motion`対応済み。
- **ハマった技術的な問題（重要・要記録）**：ブラウザがscript.jsを古い内容のままキャッシュし続け、コード変更が反映されない現象が発生。curlでサーバー側は最新化されているのに、ブラウザの`<script src>`読み込みだけ古い内容を使い続けていた。
  - **対処**：`index.html` の読み込みを `<script src="js/script.js?v=3">` のようにクエリ付きに変更してキャッシュを回避。
  - **今後script.jsを更新するたびに、末尾の `?v=N` の数字を上げること**（上げ忘れるとブラウザに変更が反映されない可能性がある）。

## DISCOGRAPHYセクション
- 1曲目のダミー「Midnight Tide (EP) / 2026.04.01」を実際の情報に差し替え：
  - タイトル：**Validation**
  - 日付：**2026.09.05**
  - タグ：**#オルタナティブロック #ラウドロック**
  - ジャケット画像：`img/Valdation_jacket.jfif`（ファイル名が"Valdation"表記で"i"が抜けているが動作に問題なし。気になる場合は将来リネーム可）
  - 音源：`audio/Valdation.mp3` を再生ボタン（▶）から再生/一時停止できるように実装（[js/script.js](js/script.js) の `.track-play[data-src]` クリックハンドラ）。一度に1曲のみ再生される仕組み。
- 2曲目「Neon Rain」・3曲目「Acqua Calda (Theme)」のダミーは削除し、**「COMING SOON」**表示のプレースホルダーに変更（日付・タグ・再生ボタンなし、`.track-soon`クラスで控えめな見た目）。
- 下部にあった「※楽曲情報はすべてダミーです」の注釈文は削除。
- レイアウト調整：各トラック行がバラバラに見える（特に再生ボタンがテキストから離れすぎる）との指摘で、`.track` に常時表示の枠線＋背景を追加してカード状にまとめ、`.disco-list` の最大幅を900px→640pxに縮小。

## 新規フォルダ
- `audio/`フォルダを新規作成（音楽ファイル格納用）。現在 `Valdation.mp3` が入っている。

## 現在の未対応・保留事項
- **YUUのプロフィール文**：本人から返事待ち。届いたら [index.html](index.html) のMEMBERSセクションに反映予定。
- **Neon Rain・Acqua Calda (Theme)** の2曲：実際の曲情報・ジャケット・音源ができ次第、COMING SOON表示から通常表示に戻す作業が必要。
- **LIVE・CONTACT**セクションはまだ完全にダミーのまま（未着手）。
- ホスティング（Cloudflare Pages等への実際のデプロイ設定）はまだ未実施。方針決定のみ済み。
- gitリポジトリ化・GitHubへの保存もまだ未実施（提案のみ）。
