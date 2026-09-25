import { ArrowRight, CarFront, PackageCheck, ShoppingBag } from "lucide-react";
import "./storefront-editorial.css";

export const productTitles: Record<string, string> = { amortecedor: "Amortecedor traseiro", "filtro-ar": "Filtro de ar", correia: "Correia dentada", bomba: "Bomba d’água", palheta: "Palheta dianteira", "cabo-bateria": "Cabo de bateria 200 A", lampada: "Lâmpada H4 60/55 W" };
export const productBenefits: Record<string, string> = { amortecedor: "Controle e conforto ao dirigir.", "filtro-ar": "Proteção para o ar que entra no motor.", correia: "Sincronia para o funcionamento do motor.", bomba: "Circulação no sistema de arrefecimento.", palheta: "Visibilidade para os dias de chuva.", "cabo-bateria": "Auxílio para uma partida de emergência.", lampada: "Iluminação para seu próximo caminho." };

export default function StorefrontEditorial() {
  return (
    <div className="nl-editorial">
      <section className="nl-order-guide" id="como-funciona" aria-labelledby="nl-order-guide-title">
        <div className="nl-editorial-heading">
          <div>
            <p className="nl-editorial-eyebrow">DA ESCOLHA À RETIRADA</p>
            <h2 id="nl-order-guide-title">Você escolhe.<br /><em>A gente cuida dos detalhes.</em></h2>
          </div>
          <p className="nl-editorial-intro">Seu pedido começa aqui e passa pela nossa equipe. Aplicação, preço e disponibilidade conferidos antes da aprovação.</p>
        </div>
        <ol className="nl-order-steps">
          <li>
            <div className="nl-step-top"><span>01</span><ShoppingBag size={25} strokeWidth={1.4} aria-hidden="true" /></div>
            <h3>Escolha sua peça</h3>
            <p>Busque pelo nome, marca ou código. Adicione ao carrinho e envie sua solicitação.</p>
            <span className="nl-step-caption">Começa no catálogo</span>
          </li>
          <li>
            <div className="nl-step-top"><span>02</span><CarFront size={28} strokeWidth={1.4} aria-hidden="true" /></div>
            <h3>A equipe confere</h3>
            <p>Com os dados do seu carro, a loja verifica a aplicação, o preço e a disponibilidade antes de aprovar.</p>
            <span className="nl-step-caption">Aprovação pela loja</span>
          </li>
          <li>
            <div className="nl-step-top"><span>03</span><PackageCheck size={27} strokeWidth={1.4} aria-hidden="true" /></div>
            <h3>Combine a retirada</h3>
            <p>Aguarde o contato da equipe para combinar o pagamento e a retirada no balcão.</p>
            <span className="nl-step-caption">Retirada combinada com você</span>
          </li>
        </ol>
        <div className="nl-order-guide-bottom">
          <p>Enviar a solicitação ainda não reserva a peça.</p>
          <a className="nl-editorial-link" href="#catalogo">Escolher minhas peças <ArrowRight size={18} aria-hidden="true" /></a>
        </div>
      </section>

      <section className="nl-fitment-guide" aria-labelledby="nl-fitment-title">
        <figure className="nl-fitment-image">
          <div className="nl-fitment-image-heading"><span>O CUIDADO COMEÇA NA ESCOLHA</span><CarFront size={23} strokeWidth={1.4} aria-hidden="true" /></div>
          <img src="/assets/car/nova-leoes-assembled.webp" alt="Carro cinza ilustrativo, visto de frente e de lado" width={2688} height={1520} loading="lazy" decoding="async" />
          <figcaption>Imagem ilustrativa. Não indica aplicação das peças.</figcaption>
        </figure>
        <div className="nl-fitment-copy">
          <p className="nl-editorial-eyebrow">CADA CARRO TEM SEUS DETALHES</p>
          <h2 id="nl-fitment-title">Parecida não basta.<br /><em>Precisa ser a certa.</em></h2>
          <p>O ano e a motorização podem mudar a peça que seu carro usa. Tenha estes dados em mãos ao enviar o pedido:</p>
          <dl className="nl-vehicle-checklist">
            <div><dt><span aria-hidden="true">01</span>Modelo</dt><dd>Marca e nome do seu carro.</dd></div>
            <div><dt><span aria-hidden="true">02</span>Ano</dt><dd>Ano de fabricação e do modelo.</dd></div>
            <div><dt><span aria-hidden="true">03</span>Motor</dt><dd>Motorização e versão, se souber.</dd></div>
          </dl>
          <p className="nl-fitment-tip">Tem o código da peça? Inclua também. Ele ajuda a equipe na conferência.</p>
        </div>
      </section>

      <section className="nl-questions" id="duvidas" aria-labelledby="nl-questions-title">
        <div className="nl-questions-heading">
          <p className="nl-editorial-eyebrow">TUDO MAIS CLARO</p>
          <h2 id="nl-questions-title">Antes de seguir<br /><em>viagem.</em></h2>
          <p>O que você precisa saber para escolher e enviar seu pedido.</p>
        </div>
        <div className="nl-questions-list">
          <details>
            <summary><span className="nl-question-number" aria-hidden="true">01</span><span>Como saber se a peça serve no meu carro?</span><span className="nl-question-toggle" aria-hidden="true" /></summary>
            <p>Confira o código e informe modelo, ano e motor no pedido. A equipe precisa confirmar a aplicação antes de aprovar. O carro da apresentação é ilustrativo e não indica compatibilidade.</p>
          </details>
          <details>
            <summary><span className="nl-question-number" aria-hidden="true">02</span><span>Meu pedido está confirmado quando envio?</span><span className="nl-question-toggle" aria-hidden="true" /></summary>
            <p>O envio é uma solicitação. A loja confere aplicação, preço e disponibilidade antes de aprovar. Aguarde o contato da equipe; o envio por si só não reserva a peça.</p>
          </details>
          <details>
            <summary><span className="nl-question-number" aria-hidden="true">03</span><span>Como funcionam o pagamento e a retirada?</span><span className="nl-question-toggle" aria-hidden="true" /></summary>
            <p>Neste momento, os pedidos são para retirada no balcão. O pagamento e o horário de retirada são combinados com a equipe após a conferência. Não há cobrança online.</p>
          </details>
          <details>
            <summary><span className="nl-question-number" aria-hidden="true">04</span><span>E se eu não encontrar a peça que procuro?</span><span className="nl-question-toggle" aria-hidden="true" /></summary>
            <p>Busque pelo nome, pela marca da peça ou pelo modelo do carro e use o filtro por veículo. O catálogo online reúne todos os itens cadastrados na loja; se ainda assim não encontrar, chame a equipe pelo WhatsApp e ela procura para você. A disponibilidade é conferida pela loja na aprovação.</p>
          </details>
        </div>
      </section>
    </div>
  );
}
