import { ArrowUpRight, Clock, MapPin, MessageCircle, Phone, ShieldCheck, Truck } from "lucide-react";
import { LOJA, enderecoLinha, mapaUrl, telefoneHref, whatsappUrl } from "@/lib/loja";
import "./storefront-institucional.css";

const CIDADE = `${LOJA.endereco.cidade}/${LOJA.endereco.uf}`;

export function StorefrontInstitucional({ totalPecas }: { totalPecas: number }) {
  const anos = new Date().getFullYear() - LOJA.fundacao;
  const pecas = totalPecas ? `${Math.floor(totalPecas / 1000)} mil` : "milhares de";
  return (
    <div className="nl-institucional">
      <section className="nl-sobre" id="quem-somos" aria-labelledby="nl-sobre-titulo">
        <div className="nl-sobre-copy">
          <p className="nl-editorial-eyebrow">QUEM SOMOS</p>
          <h2 id="nl-sobre-titulo">Desde {LOJA.fundacao}<br /><em>em {LOJA.endereco.cidade}.</em></h2>
          <p>A Nova Leões nasceu em {LOJA.fundacao} no {LOJA.endereco.bairro}, em {CIDADE}. São {anos} anos atendendo oficinas, mecânicos e motoristas da região no balcão da loja e com entrega própria.</p>
          <p>O catálogo reúne mais de {pecas} itens: peças de reposição para as principais montadoras, lubrificantes, filtros e acessórios. Cada pedido passa pela conferência de aplicação da equipe antes de ser aprovado.</p>
        </div>
        <ul className="nl-sobre-numeros" aria-label="A loja em números">
          <li><b>{LOJA.fundacao}</b><span>ano de fundação</span></li>
          <li><b>{totalPecas ? totalPecas.toLocaleString("pt-BR") : "—"}</b><span>itens no catálogo</span></li>
          <li><b>22</b><span>montadoras atendidas</span></li>
          <li><b>{CIDADE}</b><span>loja física e entrega</span></li>
        </ul>
      </section>

      <section className="nl-servicos" aria-label="Como a loja atende">
        <article><Truck size={24} strokeWidth={1.4} /><h3>Entrega própria</h3><p>Motoboys da loja levam o pedido para oficinas e clientes da região. Prazo e valor combinados no atendimento.</p></article>
        <article><ShieldCheck size={24} strokeWidth={1.4} /><h3>Aplicação conferida</h3><p>Antes de aprovar, a equipe confere se a peça serve no seu modelo, ano e motor. Sem surpresa na hora de instalar.</p></article>
        <article><MessageCircle size={24} strokeWidth={1.4} /><h3>Atendimento direto</h3><p>Não achou a peça no site? A equipe procura para você pelo WhatsApp ou telefone, inclusive itens sob encomenda.</p></article>
      </section>

      <section className="nl-contato" id="contato" aria-labelledby="nl-contato-titulo">
        <div className="nl-contato-info">
          <p className="nl-editorial-eyebrow">ONDE ESTAMOS</p>
          <h2 id="nl-contato-titulo">Venha até a loja<br /><em>ou fale com a gente.</em></h2>
          <dl>
            <div><dt><MapPin size={18} /> Endereço</dt><dd>{LOJA.endereco.logradouro}, {LOJA.endereco.numero}<br />{LOJA.endereco.bairro} · {CIDADE}<br />CEP {LOJA.endereco.cep}<br /><a href={mapaUrl} target="_blank" rel="noopener noreferrer">Ver no mapa <ArrowUpRight size={13} /></a></dd></div>
            <div><dt><Phone size={18} /> Telefone e WhatsApp</dt><dd><a href={telefoneHref}>{LOJA.telefone}</a><br /><a href={whatsappUrl("Olá! Vi o site da Nova Leões e quero falar com a loja.")} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp <ArrowUpRight size={13} /></a>{LOJA.email ? <><br /><a href={`mailto:${LOJA.email}`}>{LOJA.email}</a></> : null}</dd></div>
            <div><dt><Clock size={18} /> Horário</dt><dd>{LOJA.horario.length ? LOJA.horario.map((h) => <span key={h.dias}>{h.dias}: {h.horas}<br /></span>) : <>Confirme o horário de atendimento pelo telefone ou WhatsApp antes de vir.</>}</dd></div>
          </dl>
        </div>
        <div className="nl-contato-mapa">
          <a href={mapaUrl} target="_blank" rel="noopener noreferrer" aria-label={`Abrir o endereço ${enderecoLinha} no Google Maps`}>
            <span className="nl-mapa-pin"><MapPin size={26} /></span>
            <strong>{LOJA.endereco.logradouro}, {LOJA.endereco.numero}</strong>
            <span>{LOJA.endereco.bairro} · {CIDADE}</span>
            <em>Abrir no Google Maps <ArrowUpRight size={14} /></em>
          </a>
        </div>
      </section>

      <section className="nl-politicas" id="trocas-e-garantia" aria-labelledby="nl-politicas-titulo">
        <div>
          <p className="nl-editorial-eyebrow">TROCAS E GARANTIA</p>
          <h2 id="nl-politicas-titulo">Comprou, testou,<br /><em>ficou tranquilo.</em></h2>
        </div>
        <div className="nl-politicas-lista">
          <article><h3>Garantia</h3><p>As peças têm a garantia do fabricante e a garantia legal prevista no Código de Defesa do Consumidor. Guarde o comprovante de compra: ele é o documento da garantia.</p></article>
          <article><h3>Troca por peça errada ou com defeito</h3><p>Fale com a loja com o comprovante em mãos. A peça precisa estar sem uso, sem sinais de instalação e na embalagem original. A equipe confere e orienta sobre a troca ou a devolução.</p></article>
          <article><h3>Pedidos feitos pelo site</h3><p>O pedido só é confirmado depois da conferência da equipe. Compras feitas fora da loja física têm o prazo de arrependimento de 7 dias previsto no artigo 49 do Código de Defesa do Consumidor.</p></article>
          <article><h3>Pagamento e retirada</h3><p>Pagamento na loja ou combinado com a equipe na aprovação. Retirada no balcão ou entrega pelos motoboys da casa. Não há cobrança online neste site.</p></article>
        </div>
      </section>
    </div>
  );
}

export function RodapeLoja({ storefrontHref, departamentos, onDepartamento }: {
  storefrontHref: string; departamentos: { id: string; nome: string }[]; onDepartamento: (id: string) => void;
}) {
  return (
    <footer className="nl-footer">
      <div className="wrap">
        <div className="nl-footer-top">
          <div><p className="nl-kicker">{LOJA.nome.toUpperCase()}</p><h2>Seu próximo caminho<br />merece <em>cuidado.</em></h2></div>
          <a className="nl-button" href="#catalogo">Encontrar minha peça <ArrowUpRight size={19} /></a>
        </div>
        <div className="nl-footer-colunas">
          <div className="nl-footer-coluna">
            <a className="store-brand" href={storefrontHref} aria-label="Nova Leões, início"><img src="/assets/logo.png" alt="" loading="lazy" /><span>NOVA LEÕES<small>AUTOPEÇAS</small></span></a>
            <p>{LOJA.razaoSocial}<br />CNPJ {LOJA.cnpj}</p>
            <p>{LOJA.endereco.logradouro}, {LOJA.endereco.numero} · {LOJA.endereco.bairro}<br />{CIDADE} · CEP {LOJA.endereco.cep}</p>
          </div>
          <nav className="nl-footer-coluna" aria-label="Peças por departamento">
            <h3>Peças</h3>
            {departamentos.slice(0, 9).map((d) => <a key={d.id} href={`/?dep=${d.id}#catalogo`} onClick={(e) => { e.preventDefault(); onDepartamento(d.id); }}>{d.nome}</a>)}
            <a href="#catalogo" onClick={(e) => { e.preventDefault(); onDepartamento(""); }}>Todos os departamentos</a>
          </nav>
          <nav className="nl-footer-coluna" aria-label="Institucional">
            <h3>A loja</h3>
            <a href="#quem-somos">Quem somos</a>
            <a href="#contato">Onde estamos</a>
            <a href="#como-funciona">Como comprar</a>
            <a href="#trocas-e-garantia">Trocas e garantia</a>
            <a href="#duvidas">Dúvidas frequentes</a>
          </nav>
          <div className="nl-footer-coluna">
            <h3>Atendimento</h3>
            <a href={telefoneHref}><Phone size={14} /> {LOJA.telefone}</a>
            <a href={whatsappUrl("Olá! Vi o site da Nova Leões e quero falar com a loja.")} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>
            <a href={mapaUrl} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Como chegar</a>
            {LOJA.instagram ? <a href={`https://www.instagram.com/${LOJA.instagram}`} target="_blank" rel="noopener noreferrer">Instagram</a> : null}
          </div>
        </div>
        <div className="nl-footer-meta"><span>Seu carro. Nosso cuidado. · © {new Date().getFullYear()} {LOJA.nome}</span><span>Um ambiente da <b>octopool</b> · <a href="/gestao">Acesso da equipe <ArrowUpRight size={13} /></a></span></div>
      </div>
    </footer>
  );
}
