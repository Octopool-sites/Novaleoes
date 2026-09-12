// Escopo: Empresa Nova Leoes. Transaction READ ONLY; no financial or stock mutation.
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
const tenant='cmr9m6jgi001lx34fzpaeyrzn';
async function main(){
 const result=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const company=await tx.empresa.findUnique({where:{id:tenant},select:{id:true,nome:true,tipoVertical:true,status:true,filialDeId:true}});
  if(!company||company.tipoVertical!=='AUTOPECAS'||company.status!=='ATIVA'||company.filialDeId)throw Error('SCOPE_MISMATCH');
  const products=await tx.produto.findMany({where:{empresaId:tenant,codigo:{in:['9025.849','9019.605','9018.633','9025.476','9017.696','9000.398','9010.658','9012.840']}},select:{id:true,codigo:true,nome:true,marca:true,grupo:true,precoVenda:true,estoqueAtual:true,estoqueReservado:true,unidade:true,ativo:true,fotoUrl:true,quantidadeMinimaVenda:true},orderBy:{codigo:'asc'}});
  const migrations=await tx.$queryRawUnsafe(`SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE migration_name LIKE '%commerce%' AND rolled_back_at IS NULL`);
  return {readOnly:true,company,products,migrations};
 });console.log('COMMERCE_CATALOG_AUDIT '+JSON.stringify(result));
}
main().catch(e=>{console.error('CATALOG_AUDIT_FAILED',e.code||e.name);process.exitCode=1;}).finally(()=>db.$disconnect());
