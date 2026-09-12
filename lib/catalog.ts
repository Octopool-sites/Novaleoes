export type Product = {id:string;sku:string;name:string;brand:string;category:string;priceCents:number;stock:number;image:string;description:string;published:boolean};
export const categories=["Todas as peças","Suspensão","Filtros","Motor","Elétrica","Acessórios","Lubrificantes"];
export const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
