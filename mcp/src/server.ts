#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMingyuServer } from './create-server.js';

const server = createMingyuServer();

const transport = new StdioServerTransport();

server.connect(transport).catch((error) => {
  console.error('MCP Server 启动失败:', error);
  process.exit(1);
});
