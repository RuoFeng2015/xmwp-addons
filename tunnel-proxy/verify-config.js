#!/usr/bin/env node

/**
 * 验证 config.yaml 格式
 */

const fs = require('fs')
const yaml = require('js-yaml')

try {
  console.log('🔍 验证 config.yaml 格式...')

  const configContent = fs.readFileSync('config.yaml', 'utf8')
  const config = yaml.load(configContent)

  console.log('✅ YAML 格式有效')

  // 检查必要字段
  const requiredFields = ['name', 'version', 'slug', 'description', 'arch', 'startup', 'options', 'schema']

  for (const field of requiredFields) {
    if (!config[field]) {
      throw new Error(`缺少必要字段: ${field}`)
    }
  }

  console.log('✅ 必要字段检查通过')

  // 检查架构
  const architectures = ['aarch64', 'amd64', 'armhf', 'armv7', 'i386']
  if (!Array.isArray(config.arch) || config.arch.some(arch => !architectures.includes(arch))) {
    throw new Error('架构配置无效')
  }

  console.log('✅ 架构配置有效')

  // 检查 options 和 schema 匹配
  const optionKeys = Object.keys(config.options)
  const schemaKeys = Object.keys(config.schema)

  for (const key of optionKeys) {
    if (!schemaKeys.includes(key)) {
      console.warn(`⚠️ options 中的 ${key} 在 schema 中未定义`)
    }
  }

  console.log('✅ options 和 schema 配置检查通过')

  // 输出配置摘要
  console.log('\n📋 配置摘要:')
  console.log(`名称: ${config.name}`)
  console.log(`版本: ${config.version}`)
  console.log(`slug: ${config.slug}`)
  console.log(`架构: ${config.arch.join(', ')}`)
  console.log(`启动方式: ${config.startup}`)
  console.log(`选项数量: ${Object.keys(config.options).length}`)
  console.log(`Schema 字段: ${Object.keys(config.schema).length}`)

  if (config.ports) {
    console.log(`端口映射: ${Object.keys(config.ports).join(', ')}`)
  }

  console.log('\n🎉 config.yaml 格式验证通过!')

} catch (error) {
  console.error('❌ config.yaml 验证失败:', error.message)
  process.exit(1)
}
