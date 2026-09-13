import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Storefront from "./components/storefront";
import CommerceLogin from "./components/commerce-login";
const CommerceAdmin=lazy(()=>import("./components/commerce-admin"));
import "./app/globals.css";
import "./app/commerce.css";
function Management() {
  const [name,setName]=useState<string>();
  const [checking,setChecking]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;fetch("/api/session").then(async r=>{if(r.status===401)return;const data=await r.json() as {error?:string;name:string};if(!r.ok)throw Error(data.error||"Não foi possível conferir o acesso.");if(active)setName(data.name);}).catch(e=>active&&setError(e.message)).finally(()=>active&&setChecking(false));return()=>{active=false;};},[]);
  async function signOut(){const response=await fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(response.ok){setName(undefined);location.assign("/gestao");}else setError("Não foi possível encerrar a sessão. Tente novamente.");}
  if(checking)return <main style={{padding:"3rem"}}><p role="status">Conferindo seu acesso…</p></main>;
  if(!name)return <CommerceLogin onSignedIn={()=>location.assign("/gestao")}/>;
  return <><Suspense fallback={<p>Carregando gestão…</p>}><CommerceAdmin name={name}/></Suspense><button className="management-signout" onClick={signOut}>Sair da gestão</button>{error&&<p role="alert">{error}</p>}</>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode>{location.pathname.startsWith("/gestao")?<Management/>:<Storefront/>}</React.StrictMode>);
