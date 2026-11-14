/* 内置小说索引 */
const BUILTIN_WORLDS = [
  {
    "id": "novel_hongloumeng",
    "name": "红楼梦（曹雪芹）",
    "title": "红楼梦",
    "author": "曹雪芹",
    "complete": true,
    "edition": "一百二十回本"
  },
  {
    "id": "novel_sanguoyanyi",
    "name": "三国演义（罗贯中）",
    "title": "三国演义",
    "author": "罗贯中",
    "complete": true,
    "edition": "一百二十回本"
  },
  {
    "id": "novel_shuihuquan",
    "name": "水浒传（施耐庵）",
    "title": "水浒传",
    "author": "施耐庵",
    "complete": true,
    "edition": "一百二十回本（袁无涯本）"
  },
  {
    "id": "novel_xiyouji",
    "name": "西游记（吴承恩）",
    "title": "西游记",
    "author": "吴承恩",
    "complete": true,
    "edition": "一百回本"
  },
  {
    "id": "novel_bailuyuanfull",
    "name": "白鹿原",
    "title": "白鹿原",
    "author": "陈忠实",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "单行本"
  },
  {
    "id": "novel_pingfanfull",
    "name": "平凡的世界",
    "title": "平凡的世界",
    "author": "路遥",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "全三部"
  },
  {
    "id": "novel_santifull",
    "name": "三体",
    "title": "三体",
    "author": "刘慈欣",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "三体三部曲"
  },
  {
    "id": "novel_santisenlin",
    "name": "三体Ⅱ：黑暗森林",
    "title": "三体Ⅱ：黑暗森林",
    "author": "刘慈欣",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "三体三部曲"
  },
  {
    "id": "novel_santiyongsheng",
    "name": "三体Ⅲ：死神永生",
    "title": "三体Ⅲ：死神永生",
    "author": "刘慈欣",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "三体三部曲"
  },
  {
    "id": "novel_daomufull",
    "name": "盗墓笔记",
    "title": "盗墓笔记",
    "author": "南派三叔",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "盗墓笔记合集"
  },
  {
    "id": "novel_daomuhe",
    "name": "盗墓笔记之贺岁篇",
    "title": "盗墓笔记之贺岁篇",
    "author": "南派三叔",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "盗墓笔记合集"
  },
  {
    "id": "novel_daomubi",
    "name": "吴邪的私家笔记",
    "title": "吴邪的私家笔记",
    "author": "南派三叔",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "盗墓笔记合集"
  },
  {
    "id": "novel_jinyonga",
    "name": "书剑恩仇录",
    "title": "书剑恩仇录",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_jinyongb",
    "name": "碧血剑",
    "title": "碧血剑",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_shediaofull",
    "name": "射雕英雄传",
    "title": "射雕英雄传",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_shendiaofull",
    "name": "神雕侠侣",
    "title": "神雕侠侣",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_jinyonge",
    "name": "雪山飞狐",
    "title": "雪山飞狐",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_jinyongf",
    "name": "飞狐外传",
    "title": "飞狐外传",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_yitianfull",
    "name": "倚天屠龙记",
    "title": "倚天屠龙记",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_jinyongh",
    "name": "连城诀",
    "title": "连城诀",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_tianlongfull",
    "name": "天龙八部",
    "title": "天龙八部",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_jinyongj",
    "name": "侠客行",
    "title": "侠客行",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_xiaoaofull",
    "name": "笑傲江湖",
    "title": "笑傲江湖",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_ludingfull",
    "name": "鹿鼎记",
    "title": "鹿鼎记",
    "author": "金庸",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "金庸新修版"
  },
  {
    "id": "novel_higashinoa",
    "name": "嫌疑人X的献身",
    "title": "嫌疑人X的献身",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinob",
    "name": "放学后",
    "title": "放学后",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoc",
    "name": "白夜行",
    "title": "白夜行",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinod",
    "name": "杀人之门",
    "title": "杀人之门",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoe",
    "name": "幻夜",
    "title": "幻夜",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinof",
    "name": "神探伽利略",
    "title": "神探伽利略",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinog",
    "name": "预知梦",
    "title": "预知梦",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoi",
    "name": "伽利略的苦恼",
    "title": "伽利略的苦恼",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoj",
    "name": "圣女的救济",
    "title": "圣女的救济",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinok",
    "name": "盛夏的方程式",
    "title": "盛夏的方程式",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinol",
    "name": "虚像小丑",
    "title": "虚像小丑",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinom",
    "name": "禁忌魔术",
    "title": "禁忌魔术",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinon",
    "name": "毕业",
    "title": "毕业",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoo",
    "name": "沉睡的森林",
    "title": "沉睡的森林",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinop",
    "name": "谁杀了她",
    "title": "谁杀了她",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoq",
    "name": "恶意",
    "title": "恶意",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinor",
    "name": "我杀了他",
    "title": "我杀了他",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinos",
    "name": "只差一个谎言",
    "title": "只差一个谎言",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinot",
    "name": "红手指",
    "title": "红手指",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinou",
    "name": "新参者",
    "title": "新参者",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinov",
    "name": "麒麟之翼",
    "title": "麒麟之翼",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinow",
    "name": "祈祷落幕时",
    "title": "祈祷落幕时",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinox",
    "name": "变身",
    "title": "变身",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoy",
    "name": "分身",
    "title": "分身",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoz",
    "name": "平行世界·爱情故事",
    "title": "平行世界·爱情故事",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoaa",
    "name": "怪笑小说",
    "title": "怪笑小说",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoab",
    "name": "毒笑小说",
    "title": "毒笑小说",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoac",
    "name": "黑笑小说",
    "title": "黑笑小说",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoad",
    "name": "歪笑小说",
    "title": "歪笑小说",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoae",
    "name": "名侦探的守则",
    "title": "名侦探的守则",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoaf",
    "name": "名侦探的诅咒",
    "title": "名侦探的诅咒",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoag",
    "name": "假面饭店",
    "title": "假面饭店",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoah",
    "name": "假面前夜",
    "title": "假面前夜",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoai",
    "name": "十一字杀人",
    "title": "十一字杀人",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoaj",
    "name": "魔球",
    "title": "魔球",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoak",
    "name": "空中杀人现场",
    "title": "空中杀人现场",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoal",
    "name": "宿命",
    "title": "宿命",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoam",
    "name": "同级生",
    "title": "同级生",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoan",
    "name": "从前我死去的家",
    "title": "从前我死去的家",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoao",
    "name": "我的晃荡的青春",
    "title": "我的晃荡的青春",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoap",
    "name": "天空之蜂",
    "title": "天空之蜂",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoaq",
    "name": "秘密",
    "title": "秘密",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoar",
    "name": "单恋",
    "title": "单恋",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoas",
    "name": "湖畔",
    "title": "湖畔",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoat",
    "name": "时生",
    "title": "时生",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoau",
    "name": "绑架游戏",
    "title": "绑架游戏",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoav",
    "name": "信",
    "title": "信",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoaw",
    "name": "酷酷的代课老师",
    "title": "酷酷的代课老师",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoax",
    "name": "彷徨之刃",
    "title": "彷徨之刃",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoay",
    "name": "东野圭吾的最后致意",
    "title": "东野圭吾的最后致意",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoaz",
    "name": "濒死之眼",
    "title": "濒死之眼",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinoba",
    "name": "流星之绊",
    "title": "流星之绊",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobb",
    "name": "悖论13",
    "title": "悖论13",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobc",
    "name": "布谷鸟的蛋是谁的",
    "title": "布谷鸟的蛋是谁的",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobd",
    "name": "雪国之劫",
    "title": "雪国之劫",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobe",
    "name": "解忧杂货店",
    "title": "解忧杂货店",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobf",
    "name": "梦幻花",
    "title": "梦幻花",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobg",
    "name": "疾风回旋曲",
    "title": "疾风回旋曲",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobh",
    "name": "虚无的十字架",
    "title": "虚无的十字架",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobi",
    "name": "拉普拉斯的魔女",
    "title": "拉普拉斯的魔女",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobj",
    "name": "沉睡的人鱼之家",
    "title": "沉睡的人鱼之家",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobk",
    "name": "恋爱的贡多拉",
    "title": "恋爱的贡多拉",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobl",
    "name": "风雪追击",
    "title": "风雪追击",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobm",
    "name": "第十年的情人节",
    "title": "第十年的情人节",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobn",
    "name": "白金数据",
    "title": "白金数据",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobo",
    "name": "白马山庄谜案",
    "title": "白马山庄谜案",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobp",
    "name": "没有凶手的暗夜",
    "title": "没有凶手的暗夜",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobq",
    "name": "坏人们",
    "title": "坏人们",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_higashinobr",
    "name": "梦回都灵",
    "title": "梦回都灵",
    "author": "东野圭吾",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "东野圭吾作品集"
  },
  {
    "id": "novel_huozhefull",
    "name": "活着",
    "title": "活着",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuab",
    "name": "许三观卖血记",
    "title": "许三观卖血记",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuac",
    "name": "兄弟",
    "title": "兄弟",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuad",
    "name": "在细雨中呼喊",
    "title": "在细雨中呼喊",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuae",
    "name": "黄昏里的男孩",
    "title": "黄昏里的男孩",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuaf",
    "name": "战栗",
    "title": "战栗",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuag",
    "name": "没有一条道路是重复的",
    "title": "没有一条道路是重复的",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuah",
    "name": "世事如烟",
    "title": "世事如烟",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuai",
    "name": "温暖和百感交集的旅程",
    "title": "温暖和百感交集的旅程",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuaj",
    "name": "我胆小如鼠",
    "title": "我胆小如鼠",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuak",
    "name": "鲜血梅花",
    "title": "鲜血梅花",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhual",
    "name": "现实一种",
    "title": "现实一种",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_yuhuam",
    "name": "音乐影响了我的写作",
    "title": "音乐影响了我的写作",
    "author": "余华",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "余华作品全集"
  },
  {
    "id": "novel_shencongwena",
    "name": "沈从文文集·第一卷",
    "title": "沈从文文集·第一卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenb",
    "name": "沈从文文集·第二卷",
    "title": "沈从文文集·第二卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenc",
    "name": "沈从文文集·第三卷",
    "title": "沈从文文集·第三卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwend",
    "name": "沈从文文集·第四卷",
    "title": "沈从文文集·第四卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwene",
    "name": "沈从文文集·第五卷",
    "title": "沈从文文集·第五卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenf",
    "name": "沈从文文集·第六卷",
    "title": "沈从文文集·第六卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongweng",
    "name": "沈从文文集·第七卷",
    "title": "沈从文文集·第七卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenh",
    "name": "沈从文文集·第八卷",
    "title": "沈从文文集·第八卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongweni",
    "name": "沈从文文集·第九卷",
    "title": "沈从文文集·第九卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenj",
    "name": "沈从文文集·第十卷",
    "title": "沈从文文集·第十卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenk",
    "name": "沈从文文集·第十一卷",
    "title": "沈从文文集·第十一卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_shencongwenl",
    "name": "沈从文文集·第十二卷",
    "title": "沈从文文集·第十二卷",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_bianchengfull",
    "name": "边城",
    "title": "边城",
    "author": "沈从文",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "沈从文文集"
  },
  {
    "id": "novel_bestsellera",
    "name": "藏地密码",
    "title": "藏地密码",
    "author": "何马",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestsellerb",
    "name": "侯卫东官场笔记",
    "title": "侯卫东官场笔记",
    "author": "小桥老树",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_dongbeiwangshifull",
    "name": "东北往事",
    "title": "东北往事",
    "author": "孔二狗",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestsellerd",
    "name": "曾国藩（全3册）",
    "title": "曾国藩（全3册）",
    "author": "唐浩明",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestsellere",
    "name": "大谋小计五十年：诸葛亮传（全5册）",
    "title": "大谋小计五十年：诸葛亮传（全5册）",
    "author": "若虚",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestsellerf",
    "name": "通天人物",
    "title": "通天人物",
    "author": "李佩甫",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestsellerg",
    "name": "死亡通知单（大全集）",
    "title": "死亡通知单（大全集）",
    "author": "周浩晖",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestsellerh",
    "name": "暗黑神探",
    "title": "暗黑神探",
    "author": "周浩晖",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_bestselleri",
    "name": "全中国最穷的小伙子发财日记",
    "title": "全中国最穷的小伙子发财日记",
    "author": "重庆老康",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "畅销套装"
  },
  {
    "id": "novel_mujinhua",
    "name": "木槿花西月锦绣",
    "title": "木槿花西月锦绣",
    "author": "海飘雪",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "单行本"
  },
  {
    "id": "novel_weichengfull",
    "name": "围城",
    "title": "围城",
    "author": "钱钟书",
    "complete": true,
    "edition": "本地提供版本",
    "collection": "单行本"
  },
  {
    "id": "novel_daomuhua",
    "name": "盗墓笔记绘本",
    "title": "盗墓笔记绘本",
    "author": "南派三叔",
    "collection": "盗墓笔记合集",
    "illustrated": true
  }
];
