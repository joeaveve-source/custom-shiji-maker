/*
 * 貼るだけ！自分専用のカスタム指示メーカー｜文を組み立てる仕組み（2026-10-11）
 *
 * 選んだ答えから、カスタム指示に貼る日本語の文を組み立てる。AIは使わない（決まった文をつなぐだけ）。
 * 書き方は、OpenAIのプロンプトの書き方ガイドの考え方を応用した（公式確認_カスタム指示の書き方_20261011.md）
 *   ・具体的に書く（数字・物の名前で）
 *   ・禁止を並べるより「代わりにこうして」と書く。禁止は2つまで
 *   ・矛盾させない（長さ・口調は1つしか選べない）
 *   ・「必ず」「絶対」は使わない
 * 無料版の上限＝1,500文字（欄ごとか合計かは公式に書かれていないので、合計で収める）
 *
 * ページ（index.html）とテスト（test_maker.js）の両方から使う。
 */
(function (root) {
  "use strict";

  var LIMIT = 1499; // 無料版は1欄「1,500文字未満」（2026-10-11 実機で確認＝1,600文字で「このフィールドは 1,500 文字未満にしてください」）

  // 選択肢（id → 画面の言葉と、文に入る部品）
  var JOBS = {
    office: "会社員（事務・総務）",
    sales: "会社員（営業）",
    planning: "会社員（企画・マーケティング）",
    tech: "会社員（技術・製造・現場）",
    manager: "会社員（管理職）",
    civil: "公務員",
    freelance: "自営業・フリーランス",
    owner: "経営者",
    parttime: "パート・アルバイト",
    home: "家事・子育て中心",
    student: "学生",
    other: "その他"
  };

  // よく使う用事（3つまで）。選ぶと、用事ごとのお願いが1つ入る
  var USES = {
    research: {
      label: "調べもの",
      rule: "調べものでは、いつ時点の情報かを書いてください。大事な数字や制度には出典のリンクを付け、確かめられないことは推測だと分かるように書いてください。",
      test: "ふるさと納税の上限額は、どうやって決まるの？"
    },
    mail: {
      label: "メールや文章の下書き",
      rule: "メールの下書きは、件名と本文に分けてください。相手との関係（社内・取引先・目上など）が分からないときは、書く前に1つだけ聞いてください。そのまま送れる敬語と長さにしてください。",
      test: "取引先に、納品が1週間遅れることを伝えるメールを書いて"
    },
    summary: {
      label: "長い文章の要約",
      rule: "要約は、最初に3行でまとめ、そのあとに大事な点を箇条書きにしてください。元の文章に書いてあることだけを使ってください。",
      test: "（長めの文章を貼って）これを要約して"
    },
    idea: {
      label: "アイデア出し",
      rule: "アイデア出しでは、まず10案を1行ずつ出し、その中からおすすめを3つ選んで、理由を1行ずつ書いてください。",
      test: "職場の歓迎会でやる出し物のアイデアを出して"
    },
    excel: {
      label: "Excelや表の作業",
      rule: "Excelの質問には、関数の式と、どのセルに入れるかまで書いてください。手順は番号付きで、1つの番号に1つの操作にしてください。",
      test: "Excelで、A列の日付から曜日を出したい"
    },
    document: {
      label: "企画書や資料の構成",
      rule: "企画書や資料は、まず見出しの構成案を出し、私の確認のあとで中身を書いてください。",
      test: "業務の手間を減らす企画書を作りたい"
    },
    study: {
      label: "新しいことの勉強",
      rule: "新しいことを教えるときは、身近な例えを1つ入れ、最後に理解を確かめる質問を1つしてください。",
      test: "生成AIって、そもそも何？"
    },
    consult: {
      label: "相談・壁打ち",
      rule: "相談には、選択肢を2〜3つ出し、それぞれの良い点と気になる点を書いてから、おすすめを1つ選んでください。",
      test: "ヨガとピラティス、どっちを始めるか迷ってる"
    },
    life: {
      label: "暮らしや趣味",
      rule: "暮らしや趣味の質問は、日本の制度やお店の事情に合わせて答えてください。",
      test: "年末の大掃除、効率よく進める順番は？"
    }
  };
  var USES_MAX = 3;

  // AIの慣れ（1つ）
  var LEVELS = {
    beginner: {
      label: "はじめて",
      about: "AIはまだ使い始めたばかりです。",
      rule: "専門用語はなるべく使わず、使うときはその場でかみ砕いて説明してください。画面の操作は、押すボタンの名前まで書いてください。"
    },
    sometimes: {
      label: "ときどき使う",
      about: "AIはときどき使う程度です。",
      rule: "専門用語を使うときは、初めて出たところで短く説明してください。"
    },
    often: {
      label: "よく使う",
      about: "AIはよく使っています。",
      rule: "基本的な用語は、説明なしで使ってかまいません。"
    }
  };

  // 答えの長さ（1つ）
  var LENGTHS = {
    short: { label: "少なめ", rule: "ふつうの質問への答えは、要点だけにして5行以内を目安にしてください。もっと知りたいときは、私から聞きます。" },
    normal: { label: "ふつう", rule: "ふつうの質問への答えは、300〜500文字くらいを目安にしてください。" },
    long: { label: "くわしく", rule: "答えは、理由や背景、具体例まで含めて、くわしく書いてください。" }
  };

  // 答えの形（いくつでも）
  var FORMS = {
    conclusion: { label: "結論から", rule: "最初の1文で結論を書いてください。" },
    bullets: { label: "箇条書き", rule: "並べられる内容は、箇条書きにしてください。" },
    steps: { label: "手順は番号付き", rule: "手順は番号付きで書いてください。" },
    example: { label: "例を1つ入れる", rule: "説明には、具体例を1つ入れてください。" },
    table: { label: "比べるときは表", rule: "2つ以上を比べるときは、表にしてください。" },
    next: { label: "最後に次の一手", rule: "最後に、次にやるとよいことを1つだけ書いてください。" }
  };

  // 口調（1つ）。スタイルのおすすめは、ChatGPTの「基本のスタイルとトーン」の選択肢名（10/11公式確認。実機で要確認）
  var TONES = {
    polite: { label: "ていねい", rule: "です・ます調で、落ち着いた言葉づかいにしてください。", style: "プロフェッショナル" },
    casual: { label: "フランク", rule: "親しみやすい話し言葉で返事をしてください。敬語は使わなくて大丈夫です。", style: "フレンドリー" },
    kansai: {
      label: "関西弁",
      rule: "返事は関西弁で、明るくしてください。ただし、メールの下書きなど、そのまま人に渡す文章は標準語の敬語で書いてください。",
      style: "フレンドリー"
    }
  };

  // 気をつけてほしいこと（いくつでも）
  var CARES = {
    ask: { label: "頼み方があいまいなら、先に1つ質問", rule: "頼み方があいまいなときは、作業の前に確認の質問を1つだけしてください。" },
    honest: { label: "分からないことは、分からないと言う", rule: "分からないことや自信がないことは、そう書いてください。" },
    fact: { label: "事実と推測を分ける", rule: "事実と推測を分け、推測には「推測です」と書いてください。" },
    japan: { label: "日本の事情に合わせる", rule: "制度・お金・単位・日付は、日本のものに合わせてください。" },
    expert: { label: "お金・健康・法律は、確かめ先も", rule: "お金・健康・法律に関わる答えでは、専門家や公式で確かめるべき点を1行で書いてください。" }
  };

  // 書かないでほしいこと（2つまで）。どれも「代わりにこうして」の形
  var AVOIDS = {
    preface: { label: "前置きやお世辞", rule: "前置きやお世辞は入れず、すぐ本題に入ってください。" },
    emoji: { label: "絵文字", rule: "絵文字は使わず、文字だけで書いてください。" },
    recap: { label: "最後の長いまとめ", rule: "最後のまとめは、書くなら1行にしてください。" },
    english: { label: "英語のままの言葉", rule: "英語の言葉は、日本語に言い換えるか、意味を添えてください。" },
    warning: { label: "必要以上の注意書き", rule: "注意書きは、本当に必要なときだけ1行で書いてください。" }
  };
  var AVOIDS_MAX = 2;

  var MAXLEN = { name: 20, job: 40, other: 200 };

  function clean(s, max) {
    s = String(s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function pick(dict, ids, max) {
    var out = [];
    (ids || []).forEach(function (id) {
      if (dict[id] && out.indexOf(id) < 0 && (!max || out.length < max)) out.push(id);
    });
    return out;
  }

  // a = { name, job, jobDetail, uses[], level, length, forms[], tone, cares[], avoids[], other }
  // opts = { drop: [...] } ＝短くするときに外す部品（"other" / "avoids" / "forms" / "cares"）
  function build(a, opts) {
    a = a || {};
    var drop = (opts && opts.drop) || [];
    var about = [], how = [], uses = [], care = [];

    var name = clean(a.name, MAXLEN.name);
    if (name) about.push("私のことは「" + name + "」と呼んでください。");
    var jobLine = "";
    if (JOBS[a.job] && a.job !== "other") jobLine = "私は" + JOBS[a.job] + "です。";
    var detail = clean(a.jobDetail, MAXLEN.job);
    if (detail) jobLine += "仕事の中身は「" + detail + "」です。";
    if (jobLine) about.push(jobLine);
    var useIds = pick(USES, a.uses, USES_MAX);
    if (useIds.length) {
      about.push("ChatGPTは、" + useIds.map(function (k) { return USES[k].label; }).join("・") + "によく使います。");
    }
    if (LEVELS[a.level]) about.push(LEVELS[a.level].about);

    if (LENGTHS[a.length]) how.push(LENGTHS[a.length].rule);
    if (drop.indexOf("forms") < 0) {
      var formIds = pick(FORMS, a.forms);
      // Excelを選んでいて、手順の番号もある＝同じお願いになるので、形のほうを省く
      if (useIds.indexOf("excel") >= 0) formIds = formIds.filter(function (k) { return k !== "steps"; });
      formIds.forEach(function (k) { how.push(FORMS[k].rule); });
    }
    if (TONES[a.tone]) how.push(TONES[a.tone].rule);
    if (LEVELS[a.level]) how.push(LEVELS[a.level].rule);

    useIds.forEach(function (k) { uses.push(USES[k].rule); });

    if (drop.indexOf("cares") < 0) {
      pick(CARES, a.cares).forEach(function (k) { care.push(CARES[k].rule); });
    }
    if (drop.indexOf("avoids") < 0) {
      pick(AVOIDS, a.avoids, AVOIDS_MAX).forEach(function (k) { care.push(AVOIDS[k].rule); });
    }

    var other = drop.indexOf("other") < 0 ? clean(a.other, MAXLEN.other) : "";

    var blocks = [];
    if (about.length) blocks.push("【私について】\n" + about.join("\n"));
    if (how.length) blocks.push("【答え方】\n" + how.map(bullet).join("\n"));
    if (uses.length) blocks.push("【用事ごとのお願い】（答え方とぶつかるときは、こちらを優先してください）\n" + uses.map(bullet).join("\n"));
    if (care.length) blocks.push("【気をつけてほしいこと】\n" + care.map(bullet).join("\n"));
    if (other) blocks.push("【そのほか、知っておいてほしいこと】\n" + other);

    var text = blocks.join("\n\n");

    // 無料版の今の画面（2026-10-11に実機で確認）は、欄が4つ＝カスタム指示／ニックネーム／職業／あなたのプロフィール詳細。
    // 上限は欄ごとに「1,500文字未満」。欄に合わせて分けた版も返す
    var jobField = (JOBS[a.job] && a.job !== "other" ? JOBS[a.job] : "") + (detail ? (a.job && a.job !== "other" ? "／" : "") + detail : "");
    var profile = [];
    if (useIds.length) profile.push(about[about.length - (LEVELS[a.level] ? 2 : 1)]);
    if (LEVELS[a.level]) profile.push(LEVELS[a.level].about);
    if (other) profile.push(other);
    var main = blocks.filter(function (b) { return b.indexOf("【私について】") !== 0 && b.indexOf("【そのほか") !== 0; }).join("\n\n");
    var fields = { instructions: main, nickname: name, job: jobField, profile: profile.join("\n") };
    var over = Object.keys(fields).some(function (k) { return countChars(fields[k]) > LIMIT; });
    return {
      text: text,
      fields: fields,
      length: countChars(main),
      limit: LIMIT,
      over: over,
      style: TONES[a.tone] ? TONES[a.tone].style : ""
    };
  }

  // 超えたときに、削る順番に外していった版を返す（自由記入 → 書かないで → 形 → 気をつけて）
  function shorten(a) {
    var order = ["other", "avoids", "forms", "cares"];
    var drop = [];
    var r = build(a);
    for (var i = 0; i < order.length && r.over; i++) {
      drop.push(order[i]);
      r = build(a, { drop: drop.slice() });
      r.dropped = drop.slice();
    }
    return r;
  }

  function bullet(s) { return "・" + s; }

  // 文字数＝見た目の1文字を1と数える（絵文字なども1文字）
  function countChars(s) {
    return Array.from(String(s)).length;
  }

  var api = {
    LIMIT: LIMIT, USES_MAX: USES_MAX, AVOIDS_MAX: AVOIDS_MAX, MAXLEN: MAXLEN,
    JOBS: JOBS, USES: USES, LEVELS: LEVELS, LENGTHS: LENGTHS, FORMS: FORMS,
    TONES: TONES, CARES: CARES, AVOIDS: AVOIDS,
    build: build, shorten: shorten, countChars: countChars
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CIMaker = api;
})(this);
