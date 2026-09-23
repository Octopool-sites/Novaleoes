import { ArrowRight, Check, CarFront, PackageCheck, ShoppingBag } from "lucide-react";

export const productTitles: Record<string, string> = { amortecedor: "Amortecedor traseiro", "filtro-ar": "Filtro de ar", correia: "Correia dentada", bomba: "Bomba d’água", palheta: "Palheta dianteira", "cabo-bateria": "Cabo de bateria 200 A", lampada: "Lâmpada H4 60/55 W" };
export const productBenefits: Record<string, string> = { amortecedor: "Controle e conforto ao dirigir.", "filtro-ar": "Proteção para o ar que entra no motor.", correia: "Sincronia para o funcionamento do motor.", bomba: "Circulação no sistema de arrefecimento.", palheta: "Visibilidade para os dias de chuva.", "cabo-bateria": "Auxílio para uma partida de emergência.", lampada: "Iluminação para seu próximo caminho." };

export default function StorefrontEditorial() {
  return <>
    <section className="nl-how" id="como-funciona">
      <div className="nl-how-heading"><p className="nl-kicker">DA ESCOLHA À RETIRADA</p><h2>Seu carro precisa.<br /><em>A gente facilita.</em></h2><p>Escolha com calma. A equipe confere os detalhes com você antes de aprovar o pedido.</p><a href="#catalogo">Começar pela peça <ArrowRight size={17} /></a></div>
      <div className="nl-how-steps">
        <article><span>01</span><ShoppingBag /><h3>Encontre sua peça</h3><p>Busque pelo nome, marca ou código e adicione ao carrinho.</p></article>
        <article><span>02</span><CarFront /><h3>A gente confere com você</h3><p>Informe modelo, ano e motor. A loja verifica aplicação, preço e disponibilidade.</p></article>
        <article><span>03</span><PackageCheck /><h3>Combine sua retirada</h3><p>Aguarde o contato da equipe para confirmar pagamento e retirada no balcão.</p></article>
      </div>
    </section>
    <section className="nl-compatibility"><span className="nl-check-circle"><Check size={32} /></span><div><p className="nl-kicker">ESCOLHER BEM FAZ DIFERENÇA</p><h2>Peça parecida não é<br />sempre a peça certa.</h2><p>O mesmo modelo de carro pode usar peças diferentes conforme o ano e a motorização. Inclua esses detalhes no pedido para a loja conferir a aplicação.</p></div><a className="nl-button" href="#catalogo">Ver catálogo <ArrowRight size={18} /></a></section>
    <section className="nl-faq" id="duvidas"><div><p className="nl-kicker">PODE PERGUNTAR</p><h2>Antes de seguir<br /><em>viagem.</em></h2></div><div>
      <details><summary>Como saber se a peça serve no meu carro?</summary><p>Confira o código e informe modelo, ano e motor no pedido. A equipe precisa confirmar a aplicação antes de aprovar. O carro da apresentação é ilustrativo e não indica compatibilidade.</p></details>
      <details><summary>Meu pedido já está confirmado quando envio?</summary><p>O envio é uma solicitação. A loja confere aplicação, preço e disponibilidade antes de aprovar. Aguarde o contato da equipe; o envio por si só não reserva a peça.</p></details>
      <details><summary>Como funciona o pagamento e a entrega?</summary><p>Neste momento, os pedidos são para retirada no balcão. O pagamento e o horário de retirada são combinados com a equipe após a conferência. Não há cobrança online.</p></details>
      <details><summary>E se eu não encontrar a peça que procuro?</summary><p>Tente buscar pelo nome, pela marca ou pelo código. O catálogo online apresenta uma seleção de produtos; a disponibilidade é conferida pela loja na aprovação.</p></details>
    </div></section>
  </>;
}
