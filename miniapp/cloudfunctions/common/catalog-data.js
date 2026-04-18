// 商品真源数据
// 本文件为静态业务数据源，禁止直接写入数据库运行时字段（如 _id、createdAt、updatedAt）

const mallCategories = [
  "五行泡浴",
  "百草元气灸",
  "靶向敷贴",
  "精油系列",
  "超值套餐"
];

const visibleProductsData = [
  {
    "name": "鸡内金泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合食欲差、挑食厌食、饭后腹胀、口气重、睡眠不安、排便不规律，以及积食后伴有腹部不适的人群。",
    "detail": "调理方向：偏重消食化积、健运脾胃。\\n配方思路：以鸡内金为核心，搭配太子参、山楂、山药、茯苓，兼顾消食、健脾与和胃，适合饮食积滞、脾胃运化偏弱人群。\\n适合人群：适合食欲差、挑食厌食、饭后腹胀、口气重、睡眠不安、排便不规律，以及积食后伴有腹部不适的人群。\\n体质参考：常见舌苔厚腻，可白可黄，舌质偏红或稍红。\\n使用提示：更适合食积、脾胃不和型人群。",
    "efficacy": "偏重消食化积、健运脾胃。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 1,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/鸡内金泡浴-产品图.png"
    ]
  },
  {
    "name": "党参泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合脾胃虚弱、容易疲劳、饭后腹胀、食欲一般、大便不成形、轻微浮肿、气短乏力的人群。",
    "detail": "调理方向：偏重健脾益气、兼顾祛湿和助运。\\n配方思路：以党参为主，配合茯苓、白术、陈皮、山药、薏苡仁、鸡内金、乌药、甘草，整体偏向\"补中有运、补而不滞\"。\\n适合人群：适合脾胃虚弱、容易疲劳、饭后腹胀、食欲一般、大便不成形、轻微浮肿、气短乏力的人群。\\n体质参考：多见舌质偏淡，舌苔薄白或略腻，部分人可见齿痕。\\n使用提示：更适合脾气不足、脾虚夹湿人群。",
    "efficacy": "偏重健脾益气、兼顾祛湿和助运。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 2,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/党参泡浴-产品图.png"
    ]
  },
  {
    "name": "紫苏泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合受凉初期出现怕冷、流清涕、鼻塞、头痛、咳痰清稀、寒性腹痛、受凉后胃口差的人群。",
    "detail": "调理方向：偏重疏散风寒、和胃理气。\\n配方思路：以紫苏为主，配合防风、干姜、白芷、荆芥，兼顾散寒解表、温中和胃、通鼻止痛。\\n适合人群：适合受凉初期出现怕冷、流清涕、鼻塞、头痛、咳痰清稀、寒性腹痛、受凉后胃口差的人群。\\n体质参考：舌质偏淡红，舌苔薄白，或见白滑苔。\\n使用提示：更适合风寒初起、寒邪偏重体质。",
    "efficacy": "偏重疏散风寒、和胃理气。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 3,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/紫苏泡浴-产品图.png"
    ]
  },
  {
    "name": "金银花泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合风热初起、咽喉不适、鼻涕偏黄、口干口苦、头面发热、皮肤红疹、痱子、目赤、口舌生疮等热象偏明显人群。",
    "detail": "调理方向：偏重清热解毒、疏散风热。\\n配方思路：以金银花为核心，配合菊花、桑叶、薄荷、淡竹叶，重点清解上焦风热与热毒。\\n适合人群：适合风热初起、咽喉不适、鼻涕偏黄、口干口苦、头面发热、皮肤红疹、痱子、目赤、口舌生疮等热象偏明显人群。\\n体质参考：常见舌质偏红，舌尖、舌边红，舌苔薄黄或微黄。\\n使用提示：更适合风热、热毒偏盛人群。",
    "efficacy": "偏重清热解毒、疏散风热。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 4,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/金银花泡浴-产品图.png"
    ]
  },
  {
    "name": "桂枝泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合风寒感冒伴咳嗽、痰白稀、咳久不爽、肺气不宣、受凉后咽喉轻度不适的人群。",
    "detail": "调理方向：偏重解肌散寒、宣肺止咳。\\n配方思路：以桂枝为主，配合荆芥、前胡、桔梗、竹茹、百部、甘草，在散寒的基础上兼顾肺气宣降与痰咳调理。\\n适合人群：适合风寒感冒伴咳嗽、痰白稀、咳久不爽、肺气不宣、受凉后咽喉轻度不适的人群。\\n体质参考：舌质淡红或略暗，舌苔薄白，舌面偏润。\\n使用提示：更适合风寒外束、寒咳、痰白清稀人群。",
    "efficacy": "偏重解肌散寒、宣肺止咳。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 5,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/桂枝泡浴-产品图.png"
    ]
  },
  {
    "name": "菊花泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合风热上扰引起的头面发热、目赤、咽干咽痛、咳嗽痰黄、喉咙不清爽的人群。",
    "detail": "调理方向：偏重疏风清热、清利头目。\\n配方思路：以菊花、桑叶为主，配合前胡、连翘、甘草，兼顾上焦风热、咽喉不适与痰热壅滞。\\n适合人群：适合风热上扰引起的头面发热、目赤、咽干咽痛、咳嗽痰黄、喉咙不清爽的人群。\\n体质参考：常见舌质偏红，舌苔薄黄；湿热偏重时可见黄腻苔。\\n使用提示：更适合风热、上焦热象明显的人群。",
    "efficacy": "偏重疏风清热、清利头目。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 6,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/菊花泡浴-产品图.png"
    ]
  },
  {
    "name": "桔梗泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合外感后遗留咳嗽、咳痰偏黄或偏黏、咽喉干痒、说话嗓子不爽、痰不易咯出的人群。",
    "detail": "调理方向：偏重宣肺利咽、化痰止咳。\\n配方思路：以桔梗为核心，配合枇杷叶、紫苑、牛蒡子、甘草，重在开宣肺气、利咽化痰。\\n适合人群：适合外感后遗留咳嗽、咳痰偏黄或偏黏、咽喉干痒、说话嗓子不爽、痰不易咯出的人群。\\n体质参考：多见舌质偏红，舌苔薄黄。\\n使用提示：更适合风热犯肺、痰热壅肺或咽喉不利的人群；配方中的牛蒡子发挥着疏散风热、解毒利咽的重要辅助作用。",
    "efficacy": "偏重宣肺利咽、化痰止咳。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 7,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/桔梗泡浴-产品图.png"
    ]
  },
  {
    "name": "柴胡泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合情绪压抑、烦躁易怒、胸胁胀满、胃口受情绪影响、大便不调、经前乳房胀痛、经期不适的人群。",
    "detail": "调理方向：偏重疏肝解郁、调畅气机。\\n配方思路：以柴胡为主，配合白芍、茯苓、甘草，偏向肝郁脾虚、气机不畅兼血虚失养的调理思路。\\n适合人群：适合情绪压抑、烦躁易怒、胸胁胀满、胃口受情绪影响、大便不调、经前乳房胀痛、经期不适的人群。\\n体质参考：常见肝郁夹虚表现，舌象可偏淡或略红。\\n使用提示：更适合情绪因素影响较明显、肝郁脾虚倾向人群。",
    "efficacy": "偏重疏肝解郁、调畅气机。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 8,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/柴胡泡浴-产品图.png"
    ]
  },
  {
    "name": "艾草泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合气血不足兼寒象者，如畏寒、手脚偏凉、神疲乏力、容易感冒、出汗多、脾胃虚寒、女性小腹发凉或经期不适者。",
    "detail": "调理方向：偏重温经散寒、补气养血。\\n配方思路：以艾叶为温经散寒核心，配伍黄芪、党参、当归、陈皮、紫苏，兼顾补气血、散寒湿、理中焦。\\n适合人群：适合气血不足兼寒象者，如畏寒、手脚偏凉、神疲乏力、容易感冒、出汗多、脾胃虚寒、女性小腹发凉或经期不适者。\\n体质参考：多见气血不足、阳气偏弱体质。\\n使用提示：更适合虚寒、寒湿、气血不足方向调理。",
    "efficacy": "偏重温经散寒、补气养血。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 9,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/艾草泡浴-产品图.png"
    ]
  },
  {
    "name": "茯苓泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合眼袋浮肿、手脚肿胀、身体困重、头重如裹、食欲不振、腹胀、大便稀溏的人群。",
    "detail": "调理方向：偏重健脾运湿、利水消肿。\\n配方思路：以茯苓、白术为核心，搭配太子参、陈皮、莲子、山药、薏苡仁、茯苓皮、桑白皮、冬瓜皮、大腹皮、丝瓜络、甘草等，属于较完整的脾虚夹湿、水湿停聚调理思路。\\n适合人群：适合眼袋浮肿、手脚肿胀、身体困重、头重如裹、食欲不振、腹胀、大便稀溏的人群。\\n体质参考：常见舌体胖大、齿痕明显、苔白腻或滑润。\\n使用提示：更适合脾虚湿盛、水湿停滞人群；若阴虚干燥、津亏明显，应避免过度偏祛湿使用。",
    "efficacy": "偏重健脾运湿、利水消肿。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 10,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/茯苓泡浴-产品图.png"
    ]
  },
  {
    "name": "连翘泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合皮肤红、肿、热、痒明显，反复起疹、起疱，或伴有咽喉不适、发热偏重的热毒挟湿人群。",
    "detail": "调理方向：偏重清热解毒、凉血散结、兼顾止痒。\\n配方思路：以连翘、金银花为清热解毒核心，配合柴胡、赤芍、丹皮、桑叶、防风、苦参、黄芪、当归、甘草，兼顾热毒、血热、瘀滞与正气不足。\\n适合人群：适合皮肤红、肿、热、痒明显，反复起疹、起疱，或伴有咽喉不适、发热偏重的热毒挟湿人群。\\n体质参考：偏热、偏毒、偏湿热体质更常见。\\n使用提示：这类方偏清解，更适合表达为\"适用于热毒偏盛、湿热郁表、皮肤不适反复人群的辅助调理\"。",
    "efficacy": "偏重清热解毒、凉血散结、兼顾止痒。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 11,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/连翘泡浴-产品图.png"
    ]
  },
  {
    "name": "车前草泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合湿热偏重、食积夹湿、身体困重、胃口差、舌苔厚腻、下焦湿热倾向人群。",
    "detail": "调理方向：偏重清热利湿、健脾化浊。\\n配方思路：以车前草、茯苓为主，配合黄连/黄芩、广藿香、鸡内金、山楂、甘草，兼顾利湿、清热、化浊、消积。\\n适合人群：适合湿热偏重、食积夹湿、身体困重、胃口差、舌苔厚腻、下焦湿热倾向人群。\\n体质参考：多见苔腻、口黏口苦、便黏不爽或小便不利。\\n使用提示：实际培训与调理时，建议重点强调整体配方特别是鸡内金\"消食化积、减少积食化热生湿\"的作用。",
    "efficacy": "偏重清热利湿、健脾化浊。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 12,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/车前草泡浴-产品图.png"
    ]
  },
  {
    "name": "大青叶泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合发热偏重、咽喉不适、口干、痘疹红热、皮肤瘙痒遇热加重、热象明显的人群。",
    "detail": "调理方向：偏重清热解毒、凉血透疹。\\n配方思路：以大青叶为主，配合芦根、薄荷、浮萍、川芎，兼顾清热、透邪、生津、行气活血。\\n适合人群：适合发热偏重、咽喉不适、口干、痘疹红热、皮肤瘙痒遇热加重、热象明显的人群。\\n体质参考：常见舌质偏红、苔薄黄。偏实热证的调理思路更强。",
    "efficacy": "偏重清热解毒、凉血透疹。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 13,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/大青叶泡浴-产品图.png"
    ]
  },
  {
    "name": "黄芩泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合容易口苦、咽喉不适、上火，同时又怕冷、腹部发凉、手脚冰凉、大便稀溏、夜尿偏多的人群。",
    "detail": "调理方向：偏重清上热、温中寒，适合寒热错杂体质。\\n配方思路：以黄芩清热、干姜与桂枝温中通阳，甘草调和，整体偏向\"上热下寒、寒热并见\"的平衡调理。\\n适合人群：适合容易口苦、咽喉不适、上火，同时又怕冷、腹部发凉、手脚冰凉、大便稀溏、夜尿偏多的人群。\\n体质参考：常见寒热交织表现。\\n使用提示：这类方不适合单纯热盛或单纯虚寒的人群，要强调\"寒热夹杂、上热下寒\"这一核心识别点。",
    "efficacy": "偏重清上热、温中寒，适合寒热错杂体质。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 14,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/黄岑泡浴-产品图.png"
    ]
  },
  {
    "name": "糯稻根泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合白天无故汗出、夜间盗汗、体质偏虚、病后恢复期、睡眠中易出汗的人群。",
    "detail": "调理方向：偏重益气养阴、敛汗固表。\\n配方思路：以糯稻根为主，配伍五倍子、白术、防风，重点改善表虚不固、气阴两虚所致的虚性多汗。\\n适合人群：适合白天无故汗出、夜间盗汗、体质偏虚、病后恢复期、睡眠中易出汗的人群。\\n体质参考：舌质可偏淡或偏红，苔薄白，脉象偏细弱。\\n使用提示：更适合虚汗、自汗、盗汗类体质调理。",
    "efficacy": "偏重益气养阴、敛汗固表。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 15,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/糯稻根泡浴-产品图.png"
    ]
  },
  {
    "name": "大黄泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合大便干结、腹胀、腹痛拒按、口干口臭、烦躁、舌苔黄燥的人群。",
    "detail": "调理方向：偏重通腑泄热、消积导滞。\\n配方思路：以大黄、芒硝、皂角为主，属于偏\"实热积滞、腑气不通\"的思路。\\n适合人群：适合大便干结、腹胀、腹痛拒按、口干口臭、烦躁、舌苔黄燥的人群。\\n体质参考：常见舌质红，苔黄燥，偏实热表现。\\n使用提示：偏攻下、通泄，适合实热、积滞明显者。",
    "efficacy": "偏重通腑泄热、消积导滞。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 16,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/大黄泡浴-产品图.png"
    ]
  },
  {
    "name": "苦参泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合皮肤瘙痒、红斑、丘疹、水疱、渗出、遇热加重、天热潮湿时更明显的人群。",
    "detail": "调理方向：偏重清热燥湿、祛风止痒。\\n配方思路：以苦参为核心，配合地肤子、白鲜皮、蝉蜕，重点调理湿热浸淫、风热夹湿所致的皮肤不适。\\n适合人群：适合皮肤瘙痒、红斑、丘疹、水疱、渗出、遇热加重、天热潮湿时更明显的人群。\\n体质参考：湿热偏盛、热痒明显者更常见。\\n使用提示：更适合湿热型皮肤调理；若皮肤干燥脱屑明显、偏血虚风燥者。",
    "efficacy": "偏重清热燥湿、祛风止痒。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 17,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/苦参泡浴-产品图.png"
    ]
  },
  {
    "name": "苍耳子泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合鼻塞明显、流清涕或白黏涕、嗅觉减退、前额头痛、遇冷加重的鼻部反复不适人群。",
    "detail": "调理方向：偏重通鼻窍、散风寒、兼顾寒热错杂。\\n配方思路：以辛夷、苍耳子、细辛通窍散寒，配合薄荷、玄参、甘草，兼顾鼻窍郁闭与局部热象。\\n适合人群：适合鼻塞明显、流清涕或白黏涕、嗅觉减退、前额头痛、遇冷加重的鼻部反复不适人群。\\n体质参考：以寒为主或寒热错杂、偏寒型更常见。\\n使用提示：更适合鼻窍不利、风寒束表型人群。",
    "efficacy": "偏重通鼻窍、散风寒、兼顾寒热错杂。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 18,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/苍耳子泡浴-产品图.png"
    ]
  },
  {
    "name": "重楼泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合咽部反复红肿、异物感、痰黏难咯、上焦热毒偏盛、痰湿结聚体质人群。",
    "detail": "调理方向：偏重清热解毒、散结消肿、化痰祛湿。\\n配方思路：以重楼、夏枯草、金银花/连翘、大青叶/马齿苋、土茯苓、白鲜皮、防风/荆芥、黄芥子、甘草组成，整体偏向热毒、痰湿、结聚类体质辅助调理。\\n适合人群：适合咽部反复红肿、异物感、痰黏难咯、上焦热毒偏盛、痰湿结聚体质人群。\\n体质参考：舌质偏红，苔黄或黄腻较常见。",
    "efficacy": "偏重清热解毒、散结消肿、化痰祛湿。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 19,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/重楼泡浴-产品图.png"
    ]
  },
  {
    "name": "益智仁泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合夜尿频多、遗尿、小便清长、怕冷、精神不足、易疲劳、大便稀溏、注意力不集中、睡眠不实的人群。",
    "detail": "调理方向：偏重温补脾肾、固摄缩尿、兼顾益智安神。\\n配方思路：以益智仁、乌药、菟丝子、山药、茯苓、党参、当归、石菖蒲组合，兼顾脾肾虚寒与清窍失养。\\n适合人群：适合夜尿频多、遗尿、小便清长、怕冷、精神不足、易疲劳、大便稀溏、注意力不集中、睡眠不实的人群。\\n体质参考：常见脾肾两虚、下元不足、偏寒体质。\n使用提示：\"夜尿遗尿、畏寒乏力、脾肾不足\"三个重点方向。",
    "efficacy": "偏重温补脾肾、固摄缩尿、兼顾益智安神。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 20,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/益智仁泡浴-产品图.png"
    ]
  },
  {
    "name": "木香泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合腹胀、打嗝、食欲差、吃后不舒服、情绪影响消化、两胁胀满、经前乳房胀痛的人群。",
    "detail": "调理方向：偏重行气解郁、调中和胃。\\n配方思路：以木香、香附、槟榔、陈皮、甘草为主，重在疏通气机、缓解脘腹胀满与情志郁结。\\n适合人群：适合腹胀、打嗝、食欲差、吃后不舒服、情绪影响消化、两胁胀满、经前乳房胀痛的人群。\\n体质参考：常见肝郁气滞、脾胃气滞型表现。\n使用提示：更适合\"胀、闷、堵、郁\"这类气滞特征明显的人群；若明显虚弱无力，应搭配补益思路。",
    "efficacy": "偏重行气解郁、调中和胃。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 21,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/木香泡浴-产品图.png"
    ]
  },
  {
    "name": "龙胆草泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合口苦、目赤、头痛、烦躁、胁肋不舒、皮肤油腻、易起红疹或湿疹、尿黄、便黏的人群。",
    "detail": "调理方向：偏重清肝胆湿热、泻火解毒。\\n配方思路：以龙胆草、茵陈、金银花、郁金为主，侧重肝胆湿热、火旺上扰、下焦湿热等问题。\\n适合人群：适合口苦、目赤、头痛、烦躁、胁肋不舒、皮肤油腻、易起红疹或湿疹、尿黄、便黏的人群。\\n体质参考：常见舌质偏红，苔黄腻。",
    "efficacy": "偏重清肝胆湿热、泻火解毒。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 22,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/龙胆草泡浴-产品图.png"
    ]
  },
  {
    "name": "伸筋草泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合肩颈僵硬、肌肉酸痛、关节屈伸不利、劳损不适、受凉后筋骨酸楚、跌打损伤后瘀痛的人群。",
    "detail": "调理方向：偏重祛风除湿、舒筋活络、化瘀止痛。\\n配方思路：以伸筋草为主，配合三七、九层塔、川芎、穿山龙，适合风湿痹阻兼气血瘀滞的人群。\\n适合人群：适合肩颈僵硬、肌肉酸痛、关节屈伸不利、劳损不适、受凉后筋骨酸楚、跌打损伤后瘀痛的人群。\\n体质参考：多见风寒湿阻、瘀滞不通表现。\n使用提示：更适合寒湿劳损、筋骨酸痛人群；急性扭伤红肿期慎用。",
    "efficacy": "偏重祛风除湿、舒筋活络、化瘀止痛。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 23,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/伸筋草泡浴-产品图.png"
    ]
  },
  {
    "name": "当归泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合月经量少、色淡或夹块、痛经、经期不调、头痛、胁肋痛、腹痛等属于血瘀或血虚夹瘀的人群。",
    "detail": "调理方向：偏重养血活血、调经止痛。\\n配方思路：以当归、白芍、川芎、桃仁配伍，兼顾补血与活血，适合血虚兼瘀、瘀血阻滞人群。\\n适合人群：适合月经量少、色淡或夹块、痛经、经期不调、头痛、胁肋痛、腹痛等属于血瘀或血虚夹瘀的人群。\\n体质参考：舌质偏暗，或可见瘀点瘀斑。\\n使用提示：更适合女性气血调理与血行不畅方向。",
    "efficacy": "偏重养血活血、调经止痛。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 24,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/当归泡浴-产品图.png"
    ]
  },
  {
    "name": "红花泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合瘀血阻滞导致的痛经、经血有块、跌打损伤后瘀痛、固定部位刺痛、肤色暗沉、青紫瘀斑等人群。",
    "detail": "调理方向：偏重活血化瘀、通络止痛。\\n配方思路：以红花、桃仁、丹参、赤芍组成，重在活血祛瘀、消散瘀滞、缓解固定性疼痛。\\n适合人群：适合瘀血阻滞导致的痛经、经血有块、跌打损伤后瘀痛、固定部位刺痛、肤色暗沉、青紫瘀斑等人群。\\n体质参考：常见舌质紫暗或有瘀点。\n使用提示：更适合瘀血阻滞、疼痛固定人群；孕期及月经量过多者慎用。",
    "efficacy": "偏重活血化瘀、通络止痛。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 25,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/红花泡浴-产品图.png"
    ]
  },
  {
    "name": "益母草泡浴",
    "type": "physical",
    "category": "五行泡浴",
    "price": 16800,
    "originalPrice": 16800,
    "description": "适合产后调理、月经不调、虚寒痛经、体虚易感、下焦寒湿、女性气血调理人群。",
    "detail": "调理方向：偏重活血调经、利水消肿、兼顾益气散寒。\\n配方思路：以益母草为主，配伍黄芪、防风、艾叶，兼顾气血不足、寒湿侵袭与女性下焦调理。\\n适合人群：适合产后调理、月经不调、虚寒痛经、体虚易感、下焦寒湿、女性气血调理人群。\\n体质参考：常见气血不足兼寒湿，或寒凝血瘀表现。\n使用提示：更适合女性产后、经期调理；孕期禁用。",
    "efficacy": "偏重活血调经、利水消肿、兼顾益气散寒。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 26,
    "status": "on",
    "tags": [
      "五行泡浴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/益母草泡浴-产品图.png"
    ]
  },
  {
    "name": "1号脐灸粉（风寒感冒）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "适合风寒感冒初期及受凉人群\n1.怕冷明显、发热轻\n2.鼻塞、流清涕\n3.头痛、身体酸痛\n4.咳痰清稀\n5.受凉后腹部不适或胃口差",
    "images": [
      "/chanpin/1号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重疏散风寒、解表通窍、兼顾温中和胃\\n配方思路：以紫苏、防风、荆芥疏散风寒为核心，配合干姜温中散寒，\n白芷通鼻止痛，整体属于\"外散风寒 + 内温中焦\"的组合思路\\n适合人群：适合风寒感冒初期及受凉人群\n1.怕冷明显、发热轻\n2.鼻塞、流清涕\n3.头痛、身体酸痛\n4.咳痰清稀\n5.受凉后腹部不适或胃口差\\n体质参考：舌质偏淡红，舌苔薄白或偏滑\\n使用提示：更适合风寒初起、寒邪偏重人群。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 101,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重疏散风寒、解表通窍、兼顾温中和胃",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "2号脐灸粉（风热感冒）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "适合风热感冒及热象明显人群\n1.发热明显、怕冷轻\n2.咽喉红肿疼痛\n3.鼻涕黄、痰黄\n4.口干口苦\n5.头面发热",
    "images": [
      "/chanpin/2号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重疏散风热、清热解毒、清上焦热\\n配方思路：以金银花、菊花、桑叶、薄荷为核心疏散风热，淡竹叶引\n热下行，整体偏向\"清上焦 + 泻热毒\"的思路\\n适合人群：适合风热感冒及热象明显人群\n1.发热明显、怕冷轻\n2.咽喉红肿疼痛\n3.鼻涕黄、痰黄\n4.口干口苦\n5.头面发热\\n体质参考：舌质偏红，舌尖或舌边红，舌苔薄黄\\n使用提示：更适合风热或热毒偏盛人群",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 102,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重疏散风热、清热解毒、清上焦热",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "3号脐灸粉（宁心安神）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "适合心神不宁、睡眠问题人群\n1.入睡困难\n2.多梦易醒\n3.心烦、焦躁\n4.惊悸不安\n5.夜间易出汗",
    "images": [
      "/chanpin/3号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重养心安神、滋阴养血、缓解虚烦\\n配方思路：以酸枣仁、首乌藤、茯神为核心养心安神，配合麦冬养阴\n生津，琥珀镇惊安神，属于\"养心+安神+滋阴\"思路\\n适合人群：适合心神不宁、睡眠问题人群\n1.入睡困难\n2.多梦易醒\n3.心烦、焦躁\n4.惊悸不安\n5.夜间易出汗\\n体质参考：多见阴血不足或心神失养表现\\n使用提示：更适合虚烦不眠、心神不宁人群",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 103,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重养心安神、滋阴养血、缓解虚烦",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "4号脐灸粉（消积健脾）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "适合积食、脾胃不和人群\n1.食欲差、挑食厌食\n2.吃后腹胀\n3.口气重\n4.睡眠不安\n5.大便不规律（干或酸臭）",
    "images": [
      "/chanpin/4号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重消食化积、健脾和胃\\n配方思路：以鸡内金、山楂消食化积为核心，配合太子参、山药、茯\n苓健脾运化，属于\"消中有补、补中有运\"的思路\\n适合人群：适合积食、脾胃不和人群\n1.食欲差、挑食厌食\n2.吃后腹胀\n3.口气重\n4.睡眠不安\n5.大便不规律（干或酸臭）\\n体质参考：舌苔厚腻，可白可黄，舌质偏红\\n使用提示：更适合食积、脾胃运化差人群",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 104,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重消食化积、健脾和胃",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "5号脐灸粉（滋阴固汗）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.白天容易出汗（自汗） \n2.活动后出汗明显 \n3.体质偏虚、容易疲劳 \n4.易出汗但无明显内热者",
    "images": [
      "/chanpin/5号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重益气固表、敛汗止汗（兼顾轻度养阴\\n配方思路：以糯稻根养阴止汗为基础，配合五倍子收敛固摄，白术健脾益气固表，防风固表护卫，整体为\"益气固表为主，佐以收敛止汗\"的思路。\\n适合人群：1.白天容易出汗（自汗） \n2.活动后出汗明显 \n3.体质偏虚、容易疲劳 \n4.易出汗但无明显内热者\\n体质参考：舌质偏红容易引导到阴虚火旺。使用提示：适合气虚为主的自汗人群，偏体虚、易出汗者更为适合。\\n使用提示：适合气虚为主的自汗人群，偏体虚、易出汗者更为适合。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 105,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重益气固表、敛汗止汗（兼顾轻度养阴",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "6号脐灸粉（化痰止咳）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.咳嗽反复不愈\n2.偏轻度痰热\n3.咽喉干痒或不适\n4.感冒后遗留咳嗽",
    "images": [
      "/chanpin/6号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重宣肺化痰、利咽止咳\\n配方思路：以桔梗宣肺为核心，配合枇杷叶降气止咳，紫菀润肺化痰，\n牛蒡子利咽，甘草调和，形成\"宣降结合\"思路 。\\n适合人群：1.咳嗽反复不愈\n2.偏轻度痰热\n3.咽喉干痒或不适\n4.感冒后遗留咳嗽\\n体质参考：舌质偏红，舌苔薄黄\\n使用提示：适合咳嗽恢复期或偏轻症人群",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 106,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重宣肺化痰、利咽止咳",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "7号脐灸粉（便秘）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.大便干结\n2.排便困难、几天一次\n3.腹胀、腹痛拒按\n4.口臭、烦躁",
    "images": [
      "/chanpin/7号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重通腑泄热、攻积导滞\\n配方思路：以大黄泻下通便为核心，配合芒硝软坚润燥，皂角通腑行\n滞，属于\"攻下实热\"思路 。\\n适合人群：1.大便干结\n2.排便困难、几天一次\n3.腹胀、腹痛拒按\n4.口臭、烦躁\\n体质参考：舌质红，舌苔黄燥\\n使用提示：适合实热便秘。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 107,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重通腑泄热、攻积导滞",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "8号脐灸粉（腹泻）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.腹泻清稀\n2.吃冷后不适\n3.腹部冷痛\n4.脾胃虚寒",
    "images": [
      "/chanpin/8号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重温中散寒、止泻止痛\\n配方思路：以丁香、肉桂、荜茇温中散寒为核心，整体为\"温中止泻\"\n思路 。\\n适合人群：1.腹泻清稀\n2.吃冷后不适\n3.腹部冷痛\n4.脾胃虚寒\\n体质参考：多见阳虚或脾胃虚寒体质\\n使用提示：适合寒性腹泻。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 108,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重温中散寒、止泻止痛",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "9号脐灸粉（驱寒）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.手脚冰凉\n2，畏寒怕冷\n3.体内寒湿重\n4.受凉后不适",
    "images": [
      "/chanpin/9号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重温经散寒、祛寒化湿\\n配方思路：以艾叶、生姜、桂枝温经散寒，配合藿香化湿，形成\"温\n阳+祛湿\"思路。\\n适合人群：1.手脚冰凉\n2，畏寒怕冷\n3.体内寒湿重\n4.受凉后不适\\n体质参考：多见阳虚或寒湿体质\\n使用提示：适合寒湿、虚寒体质。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 109,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重温经散寒、祛寒化湿",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "10号脐灸粉（益智助长/肾气不足）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.夜尿频多、遗尿\n2.注意力不集中\n3.精神不足\n4.畏寒怕冷",
    "images": [
      "/chanpin/10号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重温补脾肾、固摄缩尿\\n配方思路：以益智仁温补固摄为核心，配合菟丝子、肉苁蓉补肾，党\n参健脾，属于\"脾肾同补\"思路 。\\n适合人群：1.夜尿频多、遗尿\n2.注意力不集中\n3.精神不足\n4.畏寒怕冷\\n体质参考：脾肾两虚、偏寒体质\\n使用提示：适合下元不足人群。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 110,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重温补脾肾、固摄缩尿",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "11号脐灸粉（皮肤湿热）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.皮肤瘙痒\n2.红疹、水疱\n3.湿疹、荨麻疹\n4.遇热加重",
    "images": [
      "/chanpin/11号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重清热燥湿、祛风止痒\\n配方思路：以苦参、地肤子、白鲜皮清热燥湿，蝉蜕疏风止痒，属于\n\"湿热+风\"思路 。\\n适合人群：1.皮肤瘙痒\n2.红疹、水疱\n3.湿疹、荨麻疹\n4.遇热加重\\n体质参考：湿热偏盛体质\\n使用提示：适合湿热型皮肤问题。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 111,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重清热燥湿、祛风止痒",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "12号脐灸粉（鼻炎）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.鼻塞严重\n2.流清涕或浊涕\n3.嗅觉减退\n4.鼻炎反复",
    "images": [
      "/chanpin/12号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重通鼻窍、散风寒\\n配方思路：以辛夷、苍耳子通鼻为核心，配合细辛散寒，薄荷清头目，\n玄参滋阴，形成\"通窍+调和寒热\"思路 。\\n适合人群：1.鼻塞严重\n2.流清涕或浊涕\n3.嗅觉减退\n4.鼻炎反复\\n体质参考：以鼻塞、清涕、遇冷加重、反复发作为主，寒湿型鼻窍不利。\\n使用提示：以风寒或寒湿为主。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 112,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重通鼻窍、散风寒",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "13号脐灸粉（疏肝理气）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.情绪压抑、烦躁\n2.胸胁胀满\n3.情绪影响食欲\n4.经前不适",
    "images": [
      "/chanpin/13号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重疏肝解郁、调畅气机\\n配方思路：以柴胡疏肝为核心，配合白芍养血柔肝，茯苓健脾，甘草\n调和，属于\"肝脾同调\"思路 。\\n适合人群：1.情绪压抑、烦躁\n2.胸胁胀满\n3.情绪影响食欲\n4.经前不适\\n体质参考：肝郁脾虚体质。\\n使用提示：适合情志因素明显人群。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 113,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重疏肝解郁、调畅气机",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "14号脐灸粉（补气养血/提高抵抗力）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.容易疲劳\n2.易感冒\n3.气短乏力\n4.面色淡\n5.手脚凉",
    "images": [
      "/chanpin/14号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重补气养血、温阳固表\\n配方思路：以黄芪、党参补气为核心，当归补血，陈皮理气，艾叶温\n经，形成\"气血双补+祛寒\"思路。\\n适合人群：1.容易疲劳\n2.易感冒\n3.气短乏力\n4.面色淡\n5.手脚凉\\n体质参考：气血两虚兼寒象\\n使用提示：适合体虚人群调理。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 114,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重补气养血、温阳固表",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "15号脐灸粉（活血化瘀）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.痛经、经血有块\n2.固定性疼痛\n3.跌打损伤\n•4.瘀血体质",
    "images": [
      "/chanpin/15号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重活血化瘀、通络止痛\\n配方思路：以红花、桃仁活血为核心，赤芍清热活血，益母草调经利\n水，属于\"活血祛瘀\"思路。\\n适合人群：1.痛经、经血有块\n2.固定性疼痛\n3.跌打损伤\n•4.瘀血体质\\n体质参考：舌质紫暗或有瘀点\\n使用提示：孕期及特殊人群慎用",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 115,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重活血化瘀、通络止痛",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "16号脐灸粉（清热解毒/热毒重）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.热象明显\n2.皮肤红肿明显\n3.发热偏重\n4.咽喉肿痛",
    "images": [
      "/chanpin/16号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重清热解毒、凉血散结\\n配方思路：以金银花、连翘清热解毒为核心，配合柴胡疏解半表半里，\n赤芍丹皮凉血，黄芪当归扶正，属于\"清热+扶正\"思路。\\n适合人群：1.热象明显\n2.皮肤红肿明显\n3.发热偏重\n4.咽喉肿痛\\n体质参考：热毒偏盛体质\\n使用提示：偏清解类。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 116,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重清热解毒、凉血散结",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "17号脐灸粉（发热）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.发热明显\n2.咽喉痛\n3.口干\n4.皮肤红疹",
    "images": [
      "/chanpin/17号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重清热解毒、疏散风热\\n配方思路：以大青叶清热凉血为核心，配合芦根生津，薄荷浮萍疏散\n风热，川芎行气活血 。\\n适合人群：1.发热明显\n2.咽喉痛\n3.口干\n4.皮肤红疹\\n体质参考：舌红苔黄\\n使用提示：适合风热发热。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 117,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重清热解毒、疏散风热",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "18号脐灸粉（祛湿）",
    "type": "physical",
    "category": "百草元气灸",
    "price": 2990,
    "originalPrice": 3990,
    "description": "1.身体沉重\n2.浮肿\n3.食欲差\n4.大便稀\n5.头重如裹",
    "images": [
      "/chanpin/18号脐灸粉-产品图.jpg"
    ],
    "detail": "调理方向：偏重健脾运湿、利水消肿\\n配方思路：以白术、茯苓、薏苡仁健脾祛湿为核心，太子参补气，陈\n皮理气，配合多种利水药，形成\"多通道祛湿\"思路。\\n适合人群：1.身体沉重\n2.浮肿\n3.食欲差\n4.大便稀\n5.头重如裹\\n体质参考：舌体胖大、齿痕、苔白腻\\n使用提示：适合脾虚湿重人群",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 118,
    "status": "on",
    "tags": [
      "百草元气灸"
    ],
    "efficacy": "偏重健脾运湿、利水消肿",
    "deliveryType": "express",
    "showInMall": true
  },
  {
    "name": "小儿咳喘贴",
    "type": "physical",
    "category": "靶向敷贴",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 咳嗽反复、咳痰不畅的亚健康人群\n2. 咳喘引起身体不适者\n3. 需要外用贴敷辅助调理咳嗽的儿童",
    "detail": "调理方向：偏重止咳化痰、宣肺平喘，缓解咳嗽、咳痰引起的身体不适。\\n配方思路：以百合、款冬花、甘草、黄芩、大黄、川贝母、射干、苏子、刘寄奴、没药、冰片、蜂蜜为原料，经加工制成的小儿咳喘保健贴。整体属于\"外贴止咳 + 化痰宣肺\"的组合思路。\\n适合人群：1. 咳嗽反复、咳痰不畅的亚健康人群\n2. 咳喘引起身体不适者\n3. 需要外用贴敷辅助调理咳嗽的儿童\\n体质参考：适用于咳嗽、咳痰引起的身体不适的亚健康人群，通过外用贴敷相应穴位，具有促进康复和健康的作用。\\n使用提示：1. 本品为外用品，禁止食用，应放置于儿童不易接触的地方，避免误食\n2. 婴幼儿必须在成人监护下使用，贴敷后不见好转，请立即就医\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重止咳化痰、宣肺平喘，缓解咳嗽、咳痰引起的身体不适。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 201,
    "status": "on",
    "tags": [
      "靶向敷贴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/小儿咳喘贴-产品图.jpg"
    ]
  },
  {
    "name": "小儿鼻炎贴",
    "type": "physical",
    "category": "靶向敷贴",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 鼻腔不适导致的鼻塞、鼻堵、鼻痒、鼻干、流涕的亚健康人群\n2. 鼻炎反复发作者\n3. 遇冷加重、清涕较多的儿童",
    "detail": "调理方向：偏重通鼻窍、散风寒，缓解鼻塞、鼻痒、流涕等鼻部不适。\\n配方思路：以辛夷、鹅不食草、苍耳子、白芷、广藿香、苦杏仁、人工麝香、蜂蜜为原料，经加工制成的小儿鼻炎保健贴。整体属于\"通窍散寒 + 疏风清热\"的组合思路。\\n适合人群：1. 鼻腔不适导致的鼻塞、鼻堵、鼻痒、鼻干、流涕的亚健康人群\n2. 鼻炎反复发作者\n3. 遇冷加重、清涕较多的儿童\\n体质参考：以鼻塞、清涕、遇冷加重、反复发作为主，寒湿型鼻窍不利。\\n使用提示：1. 本品为外用品，清洁贴敷部位，将本品贴敷于双侧迎香穴、鼻通穴或印堂穴，建议8-12小时更换一次\n2. 婴幼儿必须在成人监护下使用，贴敷后不见好转，请立即就医\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重通鼻窍、散风寒，缓解鼻塞、鼻痒、流涕等鼻部不适。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 202,
    "status": "on",
    "tags": [
      "靶向敷贴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/小儿鼻炎贴-产品图.jpg"
    ]
  },
  {
    "name": "儿童腺样体贴",
    "type": "physical",
    "category": "靶向敷贴",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 腺样体、扁桃体、咽喉不适引起的腺样体肥大、红肿、肿痛、鼻塞、打鼾等局部不适的亚健康人群\n2. 上焦热毒偏盛、痰湿结聚体质的儿童",
    "detail": "调理方向：偏重清热通下、活血凉血、解毒利咽，缓解腺样体肥大、扁桃体及咽喉不适引起的局部不适。\\n配方思路：以牛蒡子、玄参、连翘、大黄、黄连、苦地丁、牡蛎、黄芪、细辛、防风、薄荷、冰片、蜂蜜为原料，经加工制成的儿童腺样体保健贴。整体属于\"清热解毒 + 活血散结\"的组合思路。\\n适合人群：1. 腺样体、扁桃体、咽喉不适引起的腺样体肥大、红肿、肿痛、鼻塞、打鼾等局部不适的亚健康人群\n2. 上焦热毒偏盛、痰湿结聚体质的儿童\\n体质参考：常见热毒蕴结或痰瘀互结表现，舌质偏红，苔黄或黄腻较常见。\\n使用提示：1. 外用，清洁贴敷部位，将本品贴敷于下颚处（双侧）、涌泉穴（双侧）或相应穴位上，建议8-12小时更换一次\n2. 婴幼儿必须在成人监护下使用，贴敷后不见好转，请立即就医\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重清热通下、活血凉血、解毒利咽，缓解腺样体肥大、扁桃体及咽喉不适引起的局部不适。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 203,
    "status": "on",
    "tags": [
      "靶向敷贴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/儿童腺样体贴-产品图.jpg"
    ]
  },
  {
    "name": "小儿胀气贴",
    "type": "physical",
    "category": "靶向敷贴",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 脾胃不适、肠道胀气、泄泻、腹痛引起身体不适的亚健康人群\n2. 吃后腹胀、消化不良的儿童\n3. 腹部受凉后不适者",
    "detail": "调理方向：偏重健脾和胃、理气消胀，缓解脾胃不适、肠道胀气、泄泻、腹痛。\\n配方思路：以肉桂、炒丁香、炒谷芽、党参、小茴香、木香、藿香、香附、炙甘草、砂仁、徐长卿、当归、苏叶、蜂蜜为原料，经加工制成的小儿胀气保健贴。整体属于\"温中理气 + 健脾消胀\"的组合思路。\\n适合人群：1. 脾胃不适、肠道胀气、泄泻、腹痛引起身体不适的亚健康人群\n2. 吃后腹胀、消化不良的儿童\n3. 腹部受凉后不适者\\n体质参考：多见脾胃虚寒或气滞型表现，腹部胀满、食欲差。\\n使用提示：1. 外用，清洁贴敷部位，将本品贴敷于神阙穴、涌泉穴或相应穴位上，建议8-12小时更换一次\n2. 婴幼儿必须在成人监护下使用，贴敷后不见好转，请立即就医\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重健脾和胃、理气消胀，缓解脾胃不适、肠道胀气、泄泻、腹痛。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 204,
    "status": "on",
    "tags": [
      "靶向敷贴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/小儿胀气贴-产品图.jpg"
    ]
  },
  {
    "name": "小儿感冒贴",
    "type": "physical",
    "category": "靶向敷贴",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 感冒引起的头痛、咽痛、鼻塞、流涕、干咳不适的亚健康人群\n2. 风寒或风热感冒初期的儿童\n3. 需要外用贴敷辅助调理感冒症状者",
    "detail": "调理方向：偏重疏风解表、清热散寒，缓解感冒引起的头痛、咽痛、鼻塞、流涕、干咳不适。\\n配方思路：以金银花、黄芪、防风、连翘、羌活、青蒿、柴胡、陈皮、干姜、荆芥、桑叶、冰片、蜂蜜为原料，经加工制成的小儿感冒保健贴。整体属于\"疏风解表 + 清热散寒\"的组合思路。\\n适合人群：1. 感冒引起的头痛、咽痛、鼻塞、流涕、干咳不适的亚健康人群\n2. 风寒或风热感冒初期的儿童\n3. 需要外用贴敷辅助调理感冒症状者\\n体质参考：适用于感冒初期的亚健康人群，外感风寒或风热表证。\\n使用提示：1. 外用，清洁贴敷部位，将本品贴敷于神阙穴、膻中穴、大椎穴或相应穴位上，建议8-12小时更换一次\n2. 婴幼儿必须在成人监护下使用，贴敷后不见好转，请立即就医\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重疏风解表、清热散寒，缓解感冒引起的头痛、咽痛、鼻塞、流涕、干咳不适。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 205,
    "status": "on",
    "tags": [
      "靶向敷贴"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/小儿感冒贴-产品图.jpg"
    ]
  },
  {
    "name": "鼻舒保健油",
    "type": "physical",
    "category": "精油系列",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 风寒、感冒、鼻炎导致的鼻塞、鼻堵、鼻痒、鼻干、流鼻涕、打喷嚏等局部不适的亚健康人群\n2. 鼻腔不通、遇冷加重的儿童及成人\n3. 需要外用辅助调理鼻部症状者",
    "detail": "调理方向：偏重祛风散寒、宣通鼻窍、清热燥湿，缓解鼻塞、鼻痒、流涕等鼻部不适。\\n配方思路：以苍耳子、辛夷、鹅不食草、白芷为核心宣通鼻窍，配合金银花、黄芩、石菖蒲、野菊花清热燥湿，冰片、薄荷脑开窍醒神，麻油为基质调和诸药。整体属于\"通窍宣肺 + 祛风清热\"的外用滴涂思路。\\n适合人群：1. 风寒、感冒、鼻炎导致的鼻塞、鼻堵、鼻痒、鼻干、流鼻涕、打喷嚏等局部不适的亚健康人群\n2. 鼻腔不通、遇冷加重的儿童及成人\n3. 需要外用辅助调理鼻部症状者\\n体质参考：多见于风寒束表、鼻窍不利或风热上扰型体质，常见鼻塞流涕、嗅觉减退。\\n使用提示：1. 外用。先用温水清洁鼻腔，取本品适量滴于（或喷于）鼻腔即可，建议每日使用 2-3 次\n2. 本品为外用品，禁止食用，应放置于儿童不易接触的地方，避免误食\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重祛风散寒、宣通鼻窍、清热燥湿，缓解鼻塞、鼻痒、流涕等鼻部不适。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 301,
    "status": "on",
    "tags": [
      "精油系列"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/鼻舒保健油-产品图.jpg"
    ]
  },
  {
    "name": "脾胃舒保健精油",
    "type": "physical",
    "category": "精油系列",
    "price": 6800,
    "originalPrice": 6800,
    "description": "1. 腹部冷痛、食欲不振、恶心反酸、积食腹胀、嗳气频繁等引起身体局部不适的亚健康人群\n2. 脾胃虚寒、消化不良的儿童及成人\n3. 饮食积滞、脾胃运化偏弱需要外用辅助调理者",
    "detail": "调理方向：偏重温中健脾、理气消胀、和胃止痛，缓解腹部冷痛、食欲不振、积食腹胀。\\n配方思路：以焦山楂、陈皮、砂仁、木香为核心理气健脾、消食化积，配合肉桂、制厚朴、苍术温中燥湿，甘草、茯苓健脾益气，丁香温胃降逆，辅以甜橙精油、生姜精油、佛手柑精油芳香行气。整体属于\"温中理气 + 健脾消胀\"的外用按摩思路。\\n适合人群：1. 腹部冷痛、食欲不振、恶心反酸、积食腹胀、嗳气频繁等引起身体局部不适的亚健康人群\n2. 脾胃虚寒、消化不良的儿童及成人\n3. 饮食积滞、脾胃运化偏弱需要外用辅助调理者\\n体质参考：多见于脾胃虚寒或脾胃气滞型体质，常见腹部喜温喜按、舌苔白腻、食欲差。\\n使用提示：1. 外用。清洁穴位皮肤，取本品适量涂于神阙穴或其他相应穴位按摩至吸收，建议每日使用 1-2 次\n2. 本品为外用品，禁止食用，应放置于儿童不易接触的地方，避免误食\n3. 如使用本品期间出现红肿、瘙痒等不适，请立即停用或就医\n4. 本品为保健用品，不代替药品、医疗器械、消毒用品、保健食品、化妆品等使用",
    "efficacy": "偏重温中健脾、理气消胀、和胃止痛，缓解腹部冷痛、食欲不振、积食腹胀。",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 302,
    "status": "on",
    "tags": [
      "精油系列"
    ],
    "deliveryType": "express",
    "showInMall": true,
    "images": [
      "/chanpin/脾胃舒保健精油-产品图.jpg"
    ]
  },
  {
    "name": "脾胃养护调理套餐",
    "type": "package",
    "category": "超值套餐",
    "price": 49800,
    "originalPrice": 88000,
    "description": "含小儿脾胃推拿6次+积食推拿2次，健脾和胃、消食化积。",
    "detail": "调理方向：健脾和胃、消食化积。\\n套餐内容：\\n1. 小儿脾胃推拿 6次\\n2. 小儿积食推拿 2次\\n有效期：购买后90天内使用\\n适用人群：食欲差、挑食厌食、饭后腹胀、口气重、大便不调、易积食的儿童。",
    "efficacy": "健脾和胃、消食化积",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 401,
    "status": "on",
    "tags": [
      "超值套餐"
    ],
    "deliveryType": "instore",
    "showInMall": true,
    "images": [
      "/assets/images/package-spleen.png"
    ]
  },
  {
    "name": "安神助眠调理套餐",
    "type": "package",
    "category": "超值套餐",
    "price": 52800,
    "originalPrice": 88000,
    "description": "含安神推拿5次+头部舒缓2次+脾胃推拿1次，养心安神、疏肝定惊。",
    "detail": "调理方向：养心安神、疏肝定惊。\\n套餐内容：\\n1. 小儿安神推拿 5次\\n2. 小儿头部舒缓 2次\\n3. 小儿脾胃推拿 1次\\n有效期：购买后90天内使用\\n适用人群：夜啼哭闹、入睡困难、易惊醒、盗汗、睡眠不安稳的儿童。",
    "efficacy": "养心安神、疏肝定惊",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 403,
    "status": "on",
    "tags": [
      "超值套餐"
    ],
    "deliveryType": "instore",
    "showInMall": true,
    "images": [
      "/assets/images/package-sleep.png"
    ]
  },
  {
    "name": "春季助长免疫套餐",
    "type": "package",
    "category": "超值套餐",
    "price": 79800,
    "originalPrice": 144000,
    "description": "含助长推拿8次+捏脊保健4次，补肾健脾、益气助长。",
    "detail": "调理方向：补肾健脾、益气助长。\\n套餐内容：\\n1. 小儿助长推拿 8次\\n2. 小儿捏脊保健 4次\\n有效期：购买后180天内使用\\n适用人群：生长发育迟缓、身高体重不达标、体质虚弱、反复生病、春季助长黄金期的儿童。",
    "efficacy": "补肾健脾、益气助长",
    "stock": -1,
    "soldCount": 0,
    "sortOrder": 404,
    "status": "on",
    "tags": [
      "超值套餐"
    ],
    "deliveryType": "instore",
    "showInMall": true,
    "images": [
      "/assets/images/package-growth.png"
    ]
  }
];

const retainedFissionProduct = {
  "name": "脾胃养护推拿",
  "type": "service",
  "category": "",
  "price": 1990,
  "originalPrice": 3990,
  "sellingPoint": "裂变获客专用 · 到店脾胃养护体验",
  "applicableConstitution": "脾胃虚弱、积食易反复儿童",
  "efficacy": "脾胃养护调理体验",
  "description": "裂变获客专用 · 脾胃养护体验",
  "detail": "适合首次体验的新客户。购买后分享给好友，好友下单即返现。",
  "images": [
    "/assets/images/mall-fission-poster.png"
  ],
  "status": "on",
  "stock": 500,
  "soldCount": 0,
  "sortOrder": 0,
  "tags": [
    "裂变",
    "限时"
  ],
  "deliveryType": "instore",
  "showInMall": false
};

function loadProductImageMap() {
  try {
    return require('./product-image-map.json');
  } catch (error) {
    return {};
  }
}

function applyProductImageMap(product, imageMap) {
  if (!product) return product;
  const images = Array.isArray(product.images)
    ? product.images.map(item => imageMap[item] || item)
    : [];
  return {
    ...product,
    images
  };
}

const productImageMap = loadProductImageMap();

const allProductsData = [
  ...visibleProductsData.map(item => applyProductImageMap(item, productImageMap)),
  applyProductImageMap(retainedFissionProduct, productImageMap)
];

const fissionCampaigns = [
  {
    "productId": "（填入脾胃养护推拿的 _id）",
    "productName": "脾胃养护推拿",
    "activityPrice": 2990,
    "cashbackAmount": 1990,
    "limitPerUser": 1,
    "totalStock": 500,
    "soldCount": 0,
    "newCustomers": 0,
    "totalCashback": 0,
    "status": "active"
  }
];

const packagesData = [
  {
    productName: "脾胃养护调理套餐",
    items: [
      { name: "小儿脾胃推拿", count: 6 },
      { name: "小儿积食推拿", count: 2 }
    ],
    validDays: 90
  },
  {
    productName: "安神助眠调理套餐",
    items: [
      { name: "小儿安神推拿", count: 5 },
      { name: "小儿头部舒缓", count: 2 },
      { name: "小儿脾胃推拿", count: 1 }
    ],
    validDays: 90
  },
  {
    productName: "春季助长免疫套餐",
    items: [
      { name: "小儿助长推拿", count: 8 },
      { name: "小儿捏脊保健", count: 4 }
    ],
    validDays: 180
  }
];

module.exports = {
  mallCategories,
  visibleProductsData: allProductsData.slice(0, visibleProductsData.length),
  retainedFissionProduct: allProductsData[allProductsData.length - 1],
  allProductsData,
  fissionCampaigns,
  packagesData
};
