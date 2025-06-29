/**
 * 内网穿透中转服务器 - 重构版本
 * 模块化架构，提升代码可维护性
 */

// 导入重构后的应用
const { app } = require('./src/app');

// 直接使用重构后的应用实例
module.exports = app;
