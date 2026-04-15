// 商品真源数据
// 本文件为静态业务数据源，禁止直接写入数据库运行时字段（如 _id、createdAt、updatedAt）
// 实际数据已下沉到云函数共享模块，此处仅做透发，保证既有引用不中断。

module.exports = require('../miniapp/cloudfunctions/common/catalog-data.js');
