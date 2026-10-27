using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Threading;
using System.Web.Script.Serialization;

// No credentials are embedded or written to extension/release directories.
// Chrome/Opera authenticate the calling extension against allowed_origins.
class NativeBridge {
 static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
 static Dictionary<string,object> ReadJson(string path) {return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(path));}
 static bool Ready(string token) {
  try {var req=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:47831/health");req.Proxy=null;req.Timeout=700;req.Headers["Authorization"]="Bearer "+token;
   using(var response=req.GetResponse())using(var reader=new StreamReader(response.GetResponseStream()))return Convert.ToInt32(Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd())["protocol"])==2;
  }catch{return false;}
 }
 static byte[] ReadExact(Stream input,int count) {var data=new byte[count];int offset=0;while(offset<count){int read=input.Read(data,offset,count-offset);if(read==0)throw new Exception("Incomplete message");offset+=read;}return data;}
 static int Main(string[] args) {
  object result;
  try {
   string state=AppDomain.CurrentDomain.BaseDirectory,root=Path.GetFullPath(Path.Combine(state,".."));
   var manifest=ReadJson(Path.Combine(state,"native-host.json"));bool allowed=false;
   foreach(var origin in (IEnumerable)manifest["allowed_origins"])if(args.Length>0&&String.Equals(args[0],origin.ToString(),StringComparison.Ordinal))allowed=true;
   if(!allowed)throw new Exception("Extension not allowed");
   var input=Console.OpenStandardInput();int length=BitConverter.ToInt32(ReadExact(input,4),0);if(length<=0||length>4096)throw new Exception("Invalid message");
   var message=Json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(ReadExact(input,length)));
   if(!message.ContainsKey("type")||message["type"].ToString()!="connect")throw new Exception("Unknown request");
   var config=ReadJson(Path.Combine(state,"connection.json"));string token=config["token"].ToString();
   if(!Ready(token)){
    var process=new Process();process.StartInfo=new ProcessStartInfo(Path.Combine(root,".venv","Scripts","python.exe"),"-u \""+Path.Combine(root,"extractor.py")+"\""){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
    process.OutputDataReceived+=(s,e)=>{};process.ErrorDataReceived+=(s,e)=>{};process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();
    for(int i=0;i<35&&!Ready(token);i++)Thread.Sleep(200);
    if(!Ready(token))throw new Exception("Service unavailable");
   }
   result=new {success=true,protocol=2,token=token};
  }catch{result=new {success=false,error="Execute CONFIGURAR.cmd na pasta auxiliar-extrair para preparar o serviço de vídeo."};}
  byte[] bytes=Encoding.UTF8.GetBytes(Json.Serialize(result));var output=Console.OpenStandardOutput();output.Write(BitConverter.GetBytes(bytes.Length),0,4);output.Write(bytes,0,bytes.Length);output.Flush();return 0;
 }
}
