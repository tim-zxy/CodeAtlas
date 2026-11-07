using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

// Identity data only. No grant, impersonation, elevation or account-name lookup.
public static class WindowsProcessPrincipal {
 const string Error="WINDOWS_PROCESS_PRINCIPAL_FAILED";
 static void Need(bool value){if(!value)throw new InvalidOperationException(Error);}
 public static void ValidateInput(long pid,string challenge){
  Guid parsed;Need(pid>0&&pid<=uint.MaxValue&&challenge!=null&&Guid.TryParseExact(challenge,"D",out parsed)&&parsed.ToString("D")==challenge);
 }
 public sealed class Result {
  public readonly string schema="codeatlas.windows-process-principal";
  public readonly int version=1;
  public readonly uint pid;
  public readonly string creationTimeFileTime,sid,challenge;
  internal Result(uint pid,string creation,string sid,string challenge){this.pid=pid;creationTimeFileTime=creation;this.sid=sid;this.challenge=challenge;}
 }
 sealed class QueryHandle:SafeHandleZeroOrMinusOneIsInvalid {
  public bool releaseSucceeded;
  public QueryHandle():base(true){}
  protected override bool ReleaseHandle(){releaseSucceeded=CloseHandle(handle);return releaseSucceeded;}
 }
 [StructLayout(LayoutKind.Sequential)] struct FileTime {public uint low,high;}
 [StructLayout(LayoutKind.Sequential)] struct TokenUser {public IntPtr sid;public uint attributes;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern QueryHandle OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(QueryHandle process,out FileTime creation,out FileTime exit,out FileTime kernel,out FileTime user);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(QueryHandle process,uint access,out QueryHandle token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(QueryHandle token,int kind,IntPtr data,uint capacity,out uint required);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
 // Pure syntax/range validation: never resolves an account or calls Win32.
 static void ValidateSid(string value){
  Need(value!=null);var parts=value.Split('-');
  Need(parts.Length>=4&&parts.Length<=18&&parts[0]=="S"&&parts[1]=="1");
  string authority=parts[2];ulong number;
  if(authority.StartsWith("0x",StringComparison.Ordinal))
   Need(System.Text.RegularExpressions.Regex.IsMatch(authority,@"\A0x[0-9a-fA-F]{12}\z"));
  else Need(ulong.TryParse(authority,NumberStyles.None,CultureInfo.InvariantCulture,out number)&&number<=281474976710655UL&&number.ToString(CultureInfo.InvariantCulture)==authority);
  for(int i=3;i<parts.Length;i++){
   uint sub;Need(uint.TryParse(parts[i],NumberStyles.None,CultureInfo.InvariantCulture,out sub)&&sub.ToString(CultureInfo.InvariantCulture)==parts[i]);
  }
 }
 public static string Serialize(Result value){
  Need(value!=null);ValidateInput(value.pid,value.challenge);ulong birth;
  Need(ulong.TryParse(value.creationTimeFileTime,NumberStyles.None,CultureInfo.InvariantCulture,out birth)&&birth>0&&birth.ToString(CultureInfo.InvariantCulture)==value.creationTimeFileTime);
  ValidateSid(value.sid);
  return "{\"schema\":\"codeatlas.windows-process-principal\",\"version\":1,\"pid\":"+value.pid.ToString(CultureInfo.InvariantCulture)+",\"creationTimeFileTime\":\""+value.creationTimeFileTime+"\",\"sid\":\""+value.sid+"\",\"challenge\":\""+value.challenge+"\"}";
 }
 public static Result Query(long pid,string challenge){
  QueryHandle process=null,token=null;IntPtr data=IntPtr.Zero;Result result;
  try{
   ValidateInput(pid,challenge);
   try{
    process=OpenProcess(0x1000,false,(uint)pid);Need(process!=null&&!process.IsInvalid);
    FileTime creation,exit,kernel,user;Need(GetProcessTimes(process,out creation,out exit,out kernel,out user));
    ulong birth=((ulong)creation.high<<32)|creation.low;Need(birth>0);
    Need(OpenProcessToken(process,0x0008,out token)&&token!=null&&!token.IsInvalid);
    uint required;bool sized=GetTokenInformation(token,1,IntPtr.Zero,0,out required);
    int header=Marshal.SizeOf(typeof(TokenUser)),maximum=checked(header+SecurityIdentifier.MaxBinaryLength);
    Need(!sized&&Marshal.GetLastWin32Error()==122&&required>=header&&required<=maximum);
    data=Marshal.AllocHGlobal((int)required);uint used;
    Need(GetTokenInformation(token,1,data,required,out used)&&used>=header&&used<=required);
    var info=(TokenUser)Marshal.PtrToStructure(data,typeof(TokenUser));
    long offset=checked(info.sid.ToInt64()-data.ToInt64());
    Need(offset>=header&&offset<=used-8);
    int length=checked(8+4*Marshal.ReadByte(data,(int)offset+1));
    Need(length<=SecurityIdentifier.MaxBinaryLength&&offset+length<=used);
    var bytes=new byte[length];Marshal.Copy(info.sid,bytes,0,length);
    var sid=new SecurityIdentifier(bytes,0);Need(sid.BinaryLength==length);
    result=new Result((uint)pid,birth.ToString(CultureInfo.InvariantCulture),sid.Value,challenge);
   }finally{
    try{if(data!=IntPtr.Zero)Marshal.FreeHGlobal(data);}
    finally{try{if(token!=null)token.Dispose();}finally{if(process!=null)process.Dispose();}}
   }
   Need(token!=null&&token.releaseSucceeded&&process!=null&&process.releaseSucceeded);
   return result;
  }catch{throw new InvalidOperationException(Error);}
 }
}
