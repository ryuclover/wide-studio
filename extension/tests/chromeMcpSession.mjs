// Interactive MCP test client. Only the official server controls the isolated browser.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
const executable = process.env.WIDE_TEST_BROWSER || resolve('.browser/chrome/win64-156.0.8078.47/chrome-win64/chrome.exe');
const transport = new StdioClientTransport({ command: process.execPath, args: [
  resolve('node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'),
  `--executablePath=${executable}`, '--headless=true', '--isolated=true',
  '--categoryExtensions=true', '--viewport=1440x900', `--filesystemRoot=${resolve('..')}`,
  '--no-usage-statistics', '--no-performance-crux'
], env: { ...process.env, CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY: '1' }, stderr: 'pipe' });
const client = new Client({name:'wide-studio-validation',version:'0.2.0'},{capabilities:{}});
await client.connect(transport);
const tools = (await client.listTools()).tools;
console.log(JSON.stringify({ ready: true, tools: tools.map(t=>({name:t.name,description:t.description.slice(0,160)})) }));
for await (const line of createInterface({input:process.stdin,terminal:false})) {
  if (!line.trim()) continue;
  try {
    const command = JSON.parse(line);
    if (command.tool === 'schema') { console.log(JSON.stringify(tools.filter(t=>command.names.includes(t.name)))); continue; }
    if (command.tool === 'close') break;
    if (command.tool === 'configure_nvidia') {
      if (!process.env.NVIDIA_API_KEY) throw new Error('NVIDIA_API_KEY absent');
      const settings={provider:'nim',apiKey:process.env.NVIDIA_API_KEY,nimModel:command.model || 'nvidia/nemotron-3.5-lightning-30b-a3b',autoApplyQuickPlans:false};
      const result=await client.callTool({name:'evaluate_script',arguments:{serviceWorkerId:command.serviceWorkerId,function:`async () => { await chrome.storage.local.set({settings:${JSON.stringify(settings)}}); return {configured:true,model:${JSON.stringify(settings.nimModel)}}; }`}},undefined,{timeout:60000});
      console.log(JSON.stringify(result));continue;
    }
    const result = await client.callTool({name:command.tool,arguments:command.arguments || {}},undefined,{timeout:60000});
    console.log(JSON.stringify(result));
  } catch(error) { console.log(JSON.stringify({error:String(error)})); }
}
await client.close();
