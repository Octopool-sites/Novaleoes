import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Storefront from "./components/storefront";
const CommerceAdmin=lazy(()=>import("./components/commerce-admin"));
import "./app/globals.css";
import "./app/commerce.css";
function Management() {
  const [name,setName]=useState<string>();
  const [error,setError]=useState("");
  useEffect(()=>{let active=true;fetch("/api/session").then(async r=>{const data=await r.json() as {error?:string;name:string};if(!r.ok)throw Error(data.error||"Acesso não autorizado.");if(active)setName(data.name);}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  return name ? <Suspense fallback={<p>Carregando gestão…</p>}><CommerceAdmin name={name}/></Suspense> : <main style={{padding:"3rem",maxWidth:640,margin:"auto"}}><h1>Octopool Commerce</h1><p role={error?"alert":"status"}>{error||"Conferindo seu acesso…"}</p>{error&&<a href="/gestao">Entrar novamente</a>}</main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode>{location.pathname.startsWith("/gestao")?<Management/>:<Storefront/>}</React.StrictMode>);
