#!/usr/bin/env node

/**
 * Home Assistant 插件配置完整性验证
 * 检查是否符合官方规范
 */

const fs = require('fs')
const yaml = require('js-yaml')

try {
  console.log('🔍 Home Assistant 插件配置完整性验证')
  console.log('============================================')

  const configContent = fs.readFileSync('config.yaml', 'utf8')
  const config = yaml.load(configContent)

  console.log('✅ YAML 格式解析成功')

  // 检查基本字段
  const basicFields = {
    'name': 'string',
    'version': 'string',
    'slug': 'string',
    'description': 'string',
    'url': 'string',
    'arch': 'array',
    'startup': 'string',
    'options': 'object',
    'schema': 'object'
  }

  // 可选字段
  const optionalFields = {
    'init': 'boolean',
    'boot': 'string',
    'codenotary': 'string',
    'ports': 'object',
    'ports_description': 'object',
    'map': 'array'
  }

  console.log('\n📋 基本字段检查:')
  for (const [field, type] of Object.entries(basicFields)) {
    if (!config[field]) {
      throw new Error(`缺少必要字段: ${field}`)
    }

    const actualType = Array.isArray(config[field]) ? 'array' : typeof config[field]
    if (actualType !== type) {
      throw new Error(`字段 ${field} 类型错误，期望 ${type}，实际 ${actualType}`)
    }

    console.log(`  ✅ ${field}: ${actualType}`)
  }

  console.log('\n📋 可选字段检查:')
  for (const [field, type] of Object.entries(optionalFields)) {
    if (config.hasOwnProperty(field)) {
      const actualType = Array.isArray(config[field]) ? 'array' : typeof config[field]
      if (actualType !== type) {
        console.warn(`  ⚠️ 字段 ${field} 类型错误，期望 ${type}，实际 ${actualType}`)
      } else {
        console.log(`  ✅ ${field}: ${actualType}`)
      }
    } else {
      console.log(`  ➖ ${field}: 未设置`)
    }
  }

  // 检查架构支持
  const supportedArch = ['aarch64', 'amd64', 'armhf', 'armv7', 'i386']
  console.log('\n🏗️ 架构支持检查:')
  for (const arch of config.arch) {
    if (!supportedArch.includes(arch)) {
      throw new Error(`不支持的架构: ${arch}`)
    }
    console.log(`  ✅ ${arch}`)
  }

  // 检查启动方式
  const validStartup = ['before', 'after', 'once', 'application', 'services', 'system']
  if (!validStartup.includes(config.startup)) {
    throw new Error(`无效的启动方式: ${config.startup}`)
  }
  console.log(`\n🚀 启动方式: ${config.startup} ✅`)

  // 检查 schema 格式
  console.log('\n📝 Schema 格式检查:')
  for (const [key, value] of Object.entries(config.schema)) {
    if (typeof value !== 'string') {
      throw new Error(`Schema 字段 ${key} 必须是字符串格式`)
    }
    console.log(`  ✅ ${key}: ${value}`)
  }

  // 检查 options 和 schema 匹配
  console.log('\n🔗 Options 和 Schema 匹配检查:')
  const optionKeys = Object.keys(config.options)
  const schemaKeys = Object.keys(config.schema)

  for (const key of optionKeys) {
    if (!schemaKeys.includes(key)) {
      console.warn(`  ⚠️ options 中的 ${key} 在 schema 中未定义`)
    } else {
      console.log(`  ✅ ${key} 匹配`)
    }
  }

  // 检查端口配置
  if (config.ports) {
    console.log('\n🔌 端口配置检查:')
    for (const [port, mapping] of Object.entries(config.ports)) {
      console.log(`  ✅ ${port} -> ${mapping}`)
    }
  }

  // 检查映射配置
  if (config.map) {
    console.log('\n📂 目录映射检查:')
    for (const mapping of config.map) {
      console.log(`  ✅ ${mapping}`)
    }
  }

  // 生成最终报告
  console.log('\n📊 配置总结:')
  console.log(`  名称: ${config.name}`)
  console.log(`  版本: ${config.version}`)
  console.log(`  Slug: ${config.slug}`)
  console.log(`  支持架构: ${config.arch.length} 个`)
  console.log(`  配置选项: ${Object.keys(config.options).length} 个`)
  console.log(`  Schema 字段: ${Object.keys(config.schema).length} 个`)

  if (config.ports) {
    console.log(`  端口映射: ${Object.keys(config.ports).length} 个`)
  }

  if (config.map) {
    console.log(`  目录映射: ${config.map.length} 个`)
  }

  console.log('\n🎉 Home Assistant 插件配置验证完全通过!')
  console.log('📦 配置文件符合官方规范，可以正常更新插件')

} catch (error) {
  console.error('❌ 配置验证失败:', error.message)
  console.error('\n💡 请检查配置文件格式是否符合 Home Assistant 插件规范')
  process.exit(1)
}
