// Taxonomia pública do catálogo: departamentos → grupos do ERP.
// O ERP guarda 495 "grupos" livres (família da peça) e usa "LUBRIFICANTES" como balde genérico do
// legado. Aqui cada grupo cai num departamento por regra de palavra-chave; grupos genéricos são
// classificados pelo nome da peça. Regras em ordem: a primeira que casar vence.

export const DEPARTAMENTOS = [
  { id: "freios", nome: "Freios", resumo: "Pastilhas, discos, sapatas, cilindros e fluido" },
  { id: "suspensao", nome: "Suspensão", resumo: "Amortecedores, bandejas, pivôs, bieletas e buchas" },
  { id: "direcao", nome: "Direção", resumo: "Terminais, axiais, caixas e bombas de direção" },
  { id: "motor", nome: "Motor", resumo: "Juntas, anéis, bronzinas, coxins, válvulas e bombas de óleo" },
  { id: "correias", nome: "Correias e tensores", resumo: "Correias dentadas, Poly-V, tensores e polias" },
  { id: "arrefecimento", nome: "Arrefecimento e ar-condicionado", resumo: "Bombas d'água, radiadores, mangueiras, válvulas termostáticas e ar-condicionado" },
  { id: "filtros", nome: "Filtros", resumo: "Ar, óleo, combustível e cabine" },
  { id: "eletrica", nome: "Elétrica e ignição", resumo: "Bobinas, velas, cabos, sensores, lâmpadas e relés" },
  { id: "injecao", nome: "Injeção e combustível", resumo: "Bicos, bombas de combustível, reguladores e carburação" },
  { id: "transmissao", nome: "Transmissão e embreagem", resumo: "Kits de embreagem, homocinéticas, trizetas e câmbio" },
  { id: "rodas", nome: "Rodas, cubos e pneus", resumo: "Cubos, rolamentos de roda, porcas, calotas e pneus" },
  { id: "escapamento", nome: "Escapamento", resumo: "Coletores, juntas, catalisadores e coxins de escapamento" },
  { id: "cabos", nome: "Cabos e pedais", resumo: "Cabos de acelerador, afogador, capô e velocímetro" },
  { id: "lubrificantes", nome: "Lubrificantes e fluidos", resumo: "Óleos de motor e câmbio, aditivos, graxas e produtos químicos" },
  { id: "carroceria", nome: "Carroceria e acessórios", resumo: "Maçanetas, fechaduras, retrovisores, palhetas e acabamentos" },
  { id: "ferramentas", nome: "Ferramentas e fixação", resumo: "Chaves, macacos, parafusos, porcas e abraçadeiras" },
  { id: "outras", nome: "Outras peças", resumo: "Peças diversas do catálogo" },
];

// Baldes do legado sem informação nenhuma: só o nome do produto decide; sem regra, vai para "outras".
export const GRUPOS_BALDE = /^(LUBRIFICANTES|DIVERSOS|OUTROS|CONSUMO LOJA|PATRIMONIO|ACESSORIO|oleo motor)$/i;
// Grupos do ERP genéricos demais: o nome do produto decide primeiro, o grupo é o fallback.
const GRUPOS_GENERICOS = /^(REPARO|JUNTA|JUNTAS|BUCHA|BUCHAS|TAMPA|TUBO|MANGUEIRA|CONEXAO|ANEL|HASTE|SUPORTE|KIT|OUTROS|CONSUMO LOJA|PATRIMONIO|ACESSORIO|CARCACA|FLANGE|POLIA|TENSOR|ROLAMENTO|VALVULA|SENSOR|CABO|BORRACHA|GUARNICAO|PINO|PORCA|PARAFUSO|ARRUELA|COXIM|CALCO|CAPA|TERMINAL|ENGRENAGEM|EIXO|GARFO|FILTRO|CORREIA|MOTOR|CAMBIO|FREIO|DISCO|TAMBOR|LONA|VELA|BOBINA|CHAPA|MANCAL|GUIA|BARRA|PEDAL|TRAVA DIVERSAS|MOLA DIVERSAS|JUNTA DIVERSAS)$/i;

// [regex sobre o texto normalizado (sem acento, maiúsculo), departamento]
const REGRAS = [
  // Lubrificantes e químicos primeiro: o balde LUBRIFICANTES do legado tem de tudo, mas óleo é óleo.
  [/\b\d{1,2}W\d{2}\b|\bSAE\b|\bATF\b|\bGL[- ]?[45]\b|\bOLEO (DE )?(MOTOR|CAMBIO|TRANSMISSAO|HIDRAULIC|2T|4T|MOTO)|\bLUBRIFICANTE|\bGRAXA\b|\bADITIVO|\bFLUIDO\b|\bSILICONE\b|\bSPRAY\b|\bDESCARBONIZANTE|\bDESCABONIZANTE|\bVASELINA\b|\bQUEROSENE\b|\bSOLUCAO\b|\bLIMPA (PNEU|CONTATO|PARA|VIDRO|MAO|CARB)|\bCERA\b|\bMASSA (DE )?POLIR|\bAROMATIZANTE|\bDESENGRIPANTE|\bANTI ?CHAMA\b|\bANTICORROSIVO|\bREMOVEDOR\b|\bPOLIDOR|\bSHAMPOO|\bESTOPA\b|\bALGODAO\b|\bPASTA\b|\bCOLA\b|\bADESIVO\b|\bVEDA (JUNTA|ESCAPE|ROSCA|CALHA)|\bSELANTE|\bTRAVA (ROSCA|QUIMICA)|\bAGUA (DESMINERALIZADA|DESTILADA|BATERIA)|\bLIQUIDO (DE )?ARREF|\bARREFECEDOR\b|\bRADIADOR (5|10|20|50)\b|\bSILICONE\b/, "lubrificantes"],

  // Elétrica básica antes de tudo: relé, fusível, chicote e cabos de bateria não mudam de área pelo contexto.
  [/\bRELE\b|\bFUSIVEL|\bPORTA ?FUSIVE|\bCHICOTE|\bCONECTOR\b|\bCABO (DE )?(BATERIA|CHUPETA)|\bBATERIA\b|\bLAMP(ADA)?S?\b|\bSOQUETE\b/, "eletrica"],
  // Pneus e ferramentas que o legado jogou em LUBRIFICANTES.
  [/\bPNEU|\b(PIRELLI|GOODYEAR|MICHELIN|DUNLOP|FIRESTONE|BRIDGESTONE|CONTINENTAL|HANKOOK|FULDA|UNIROYAL|KLEBER)\b|\b\d{3}[-\/ ]\d{2}[-\/ ]?R?\d{2}\b/, "rodas"],
  [/\bFURADEIRA|\bPARAFUSADEIRA|\bESMERIL|\bLIXADEIRA|\bSERRA\b|\bFACA\b|\bMARTELO|\bTALHADEIRA|\bLIMA\b|\bTRENA|\bSOLDA|\bELETRODO|\bMAQUINA DE SOLDA|\bMACACO|\bCAVALETE (HIDR|MEC|DE )|\bTORQUIMETRO|\bALICATE|\bCHAVE (COMBINADA|FIXA|ESTRELA|ALLEN|CANHAO|DE BOCA|BIEL|PHILLIPS|FENDA|INGLESA|GRIFO|DE RODA|CATRACA)|\bJOGO DE (CHAVES?|SOQUETES?|BITS)|\bSOQUETE (DE )?\d|\bBROCA|\bMULTIMETRO|\bLANTERNA (DE )?(LED|MAO)|\bEXTENSAO ELETRICA|\bBOMBA (DE )?(GRAXA|ENCHER)\b|\bCALIBRADOR|\bCADEADO/, "ferramentas"],

  // Carroceria antes de motor/elétrica: cilindros de ignição/porta, máquinas de vidro, acabamentos.
  [/\bMAQ(UINA)? ?(DE )?(VID|VD)|\bMAN VID|\bCIL(INDRO)? ?(IG|IGN|PTA|PORTA|P MALA|MALA|C\/C)\b|\bCILINDRO (DE )?(IGNICAO|PORTA|MALA)|\bTRINCO|\bALCA\b|\bAPOIO (DE )?BRACO|\bCAPA RECL|\bMOLD(URA)?\b|\bGUARDA ?PO\b|\bELASTICO|\bBAGAGEIRO|\bASPIRADOR|\bALTO ?-?F(ALANTE)?\b|\bALTO F\.|\bTOMADA\b|\bSACOLA|\bLAVA ?AUTOS|\bBRACO (DO )?LIMP|\bBARRA (DO )?LIMP|\bSUPORTE VID|\bBOTA\b|\bCESTO|\bTAPA ?BURACO|\bRETROV\b|\bCIRCUITO LANT|\bDOBRADICA|\bCACAMBA|\bTAPETE|\bCAPA (DE )?(BANCO|VOLANTE)|\bPELICULA|\bSOM\b/, "carroceria"],
  // Químicos e consumíveis de oficina.
  [/\bARALDITE|\bBRASCOVED|\bMAXI ?RUBBER|\bEPOXI|\bPRIMER\b|\bTINTA\b|\bVERNIZ|\bMASSA (PLASTICA|RAPIDA)|\bDESENGRAXANTE|\bLUBRIFICANTE|\bWD-?40/, "lubrificantes"],

  // Freios
  [/\bPAST(ILHA)?S? (DE )?FREIO|\bPASTILHA|\bDISCO (DE )?FREIO|\bSAPATA|\bLONA (DE )?FREIO|\bLONAS\b|\bTAMBOR (DE )?FREIO|\bCIL(INDRO)? MESTRE (DE )?FREIO|\bCIL(INDRO)? (DE )?RODA|\bFLEX(IVEL)? (DE )?FREIO|\bCABO (DE )?FREIO|\bSERVO ?FREIO|\bHIDROVACUO|\bREPARO (DE )?(FREIO|PINCA|CIL RODA|CIL MESTRE|SERVO)|\bREGULADOR (DE )?FREIO|\bPINCA|\bALAVANCA (DE )?FREIO|\bTUBO (DE )?FREIO|\bFREIO (DE )?MAO|\bKIT MOLA SAPATA|\bPATIM\b|\bVALV(ULA)? EQUALIZADORA|\bSENSOR (DE )?ABS|\bSENSOR ABS|\bMOLA (DE )?SAPATA|\bCILINDRO MESTRE\b|\bFLUIDO (DE )?FREIO|\bPASTILHAS|\bTAMBOR\b|\bJG\.? ?DE LONA|\bLONAS?\b|\bCJ\.? ?MESTRE SERVO|\bSERVO\b|\bFREIO\b/, "freios"],

  // Direção (antes de suspensão: "terminal", "axial", "caixa")
  [/\bTERM(INAL)? (DE )?DIR|\bTERMINAL DIRECAO|\bAXIAL|\bCAIXA (DE )?DIR|\bCX (DE )?DIR|\bBARRA (DE )?DIR|\bBUCHA (DA )?(CAIXA|BARRA) DIR|\bCOIFA (DA )?(CAIXA|CX) (DE )?DIR|\bCOLUNA (DE )?DIR|\bBOMBA (DE )?DH\b|\bBOMBA (DE )?DIR|\bDIR(ECAO)? HIDR|\bRESERV(ATORIO)? DIR|\bAMORT(ECEDOR)? (DE )?DIRE|\bPITMAN|\bSENSOR (DE )?DH\b|\bROL(AMENTO)? (DE )?DIR|\bROL DIR\b|\bROL CX DIR|\bCARDAN (DE )?DIR|\bSETOR (DE )?DIR|\bTERMINAL\b|\bDIRECAO\b/, "direcao"],

  // Rodas e cubos (antes de suspensão)
  [/\bCUBO (DE )?RODA|\bCUBO\b|\bROL(AMENTO)? (DE )?RODA|\bROL RODA|\bROLAMENTO RD\b|\bPARAFUSO(\/PORCA)? (DE )?RODA|\bPORCA (DE )?RODA|\bCALOTA|\bCALOTINHA|\bPNEU|\bCHAVE (DE )?RODA|\bKIT ROLAMENTO\b|\bPRISIONEIRO (DE )?RODA|\bRODA\b/, "rodas"],

  // Suspensão
  [/\bAMORT(ECEDOR)?\b(?! (TAMPA|PORTA|CAPO|VIDRO|MALA|DIRE))|\bKIT AMORT|\bBANDEJA|\bBAND\b|\bPIVO|\bBIELETA|\bCOXIM (DO )?AMORT|\bBUCHAS? (DA |DE |DO )?(BANDEJA|BARRA ESTAB|EIXO|BRACO|AMORT|QUADRO|SUSP|ESTAB)|\bBARRA ESTAB|\bKIT (BARRA )?ESTAB|\bMOLA (DE )?SUSP|\bMOLA HELICOIDAL|\bFEIXE (DE )?MOLA|\bBATENTE|\bROL(AMENTO)? (DO )?AMORT|\bPRATO (DO )?(AMORT|MOLA)|\bCALCO (DE )?MOLA|\bBUCHA (DO )?AMORT|\bBRACO (OSCILANTE|SUSP|AUXILIAR|TENSOR)|\bBUCHA (DO )?BRACO|\bBUCHA (DO )?EIXO|\bBUCHA (DO )?QUADRO|\bMORCEGO|\bTIRANTE|\bESTABILIZADOR|\bCAMBAGEM|\bBRACO (DA )?SUSPE|\bBRACO TRASEIRO|\bBARRA (DE )?(TORCAO|REACAO)|\bJUMELO|\bFACAO|\bBUCHA (DA )?BANDEIJA|\bSUSPENCAO|\bSUSPENSAO|\bSUSP\b|\bCOXIM (DA )?SUSP|\bKIT BATENTE|\bCOIFA (DO )?AMORT|\bMOLAS?\b/, "suspensao"],

  // Correias e tensores
  [/\bCORREIA|\bTENSOR (DA )?(DENT|CORREIA|ALT|POLY)|\bPOLIA (TENSORA|ALT|DO ALT|DENT|VIRA|LIVRE|BOMBA)|\bPOLIA\b|\bTENSOR\b|\bESTIC(ADOR)?\b|\bROL(AMENTO)? (DA )?CORREIA|\bKIT DISTR|\bKIT CORREIA|\bBRACO TENSOR|\bBUCHA TENSOR/, "correias"],

  // Arrefecimento
  [/\bBOMBA (DE )?(D')?AGUA|\bBOMBA D ?'?AGUA|\bBBA (D')?AGUA|\bBOMBA DAGUA|\bRADIADOR(?! (DE )?OLEO)|\bRAD\b|\bAQUEC|\bAR QUENTE|\bMANG(UEIRA)? (DO )?RAD|\bVALV(ULA)? TERMO|\bTERMOSTAT|\bRESERV(ATORIO)? (DE )?(D')?AGUA|\bRESERV DAGUA|\bTUBO (DE )?(REFRIG|D'?AGUA|AGUA)|\bMANG(UEIRA)? (DO )?RESERV|\bTAMPA (DO )?(RESERV|RADIADOR)|\bFLANGE (DA )?(BOMBA|TERMO|CABECOTE)|\bCARCACA (DA )?(VALV|BOMBA)|\bMANG(UEIRA)? (DE )?ARREF|\bCEBOLAO|\bSENSOR (DE )?TEMP|\bTROCADOR (DE )?CALOR|\bRADIADOR (DE )?OLEO|\bVENTOINHA|\bVENTUINHA|\bELETROVENTILADOR|\bMOTOR (DA )?VENT|\bHELICE|\bCONDENSADOR|\bEVAPORADOR|\bCOMPRESSOR (DE )?AR|\bINTERCOOLER|\bARREFECIMENTO|\bREFRIGERACAO|\bDAGUA\b|\bD'AGUA\b|\bANEL (DA )?BOMBA (D')?AGUA|\bJUNTA (DA )?(TAMPA )?(BBA|BOMBA) (D')?AGUA/, "arrefecimento"],

  // Filtros
  [/\bFILTRO|\bPRE FILTRO|\bELEMENTO (DE )?FILTR|\bKIT FILTROS?/, "filtros"],

  // Escapamento
  [/\bESCAPAMENTO|\bESCAPE\b|\bESCAP\b|\bCATALISADOR|\bSILENCIOSO|\bCOLETOR (DE )?ESCAP|\bJUNTA (DO |DE )?(COLETOR|ESCAP|SAIDA)|\bCOXIM (DO )?ESCAP|\bGAXETA|\bPONTEIRA|\bTUBO (DE )?ESCAP|\bABRACADEIRA (DE )?ESCAP|\bCOLETOR\b|\bVEDA ESCAPE/, "escapamento"],

  // Injeção e combustível
  [/\bBICO (DE )?INJ|\bINJETOR|\bBOMBA (ELETRICA|DE )?COMB|\bBOMBA ELETRICA|\bBOMBA (DE )?COMBUSTIVEL|\bREGULADOR (DE )?PRES|\bBOIA (DE )?COMB|\bBOIA\b|\bTANQUE|\bMODULO (DE )?COMB|\bREFIL (DA )?BOMBA|\bATUADOR (DE )?M\.?LENTA|\bMARCHA LENTA|\bJUNTA (DA )?INJ|\bTBI\b|\bCORPO (DE )?BORBOLETA|\bGICLEUR|\bGICLE|\bCARBURADOR|\bCARB\b|\bREPARO (DO )?BICO|\bKIT (REPARO )?BICO|\bTAMPA (DO )?(COMB|TANQUE|RESERV COMB)|\bCANISTER|\bMEDIDOR (DE )?COMB|\bINJECAO|\bINJ\b|\bPARTIDA (A )?FRIO|\bMANG(UEIRA)? (DE )?COMB|\bMAGUEIRA DE COMBUSTIVEL|\bCOMBUSTIVEL|\bAFOGADOR|\bCEBOLINHA (DE )?COMB|\bFLAUTA|\bSOLENOIDE|\bVACUO\b|\bBOMBINHA|\bVALVULA AGULHA|\bCENTRALIZADOR|\bT COMB\b|\bTUBO ABAST|\bDIAFRAGMA (REG|DO |DA )|\bCAPSULA|\bREFIL\b/, "injecao"],

  // Transmissão e embreagem
  [/\bEMBREAGEM|\bEMBR\b|\bHOMOCINETICA|\bHOMOC?\b|\bCOIFA (DA )?HOMO|\bTRIZETA|\bTRISETA|\bTULIPA|\bJUNTA (DESLIZANTE|DESLISANTE)|\bSEMI ?EIXO|\bROL(AMENTO)? (DE )?EMBR|\bGARFO|\bCIL(INDRO)? MESTRE (DE )?EMBR|\bCILINDRO (DE )?EMBR|\bATUADOR (DE )?EMBR|\bTRAMBULADOR|\bTRAMB\b|\bALAVANCA (DE )?CAMBIO|\bALAVANCA\b|\bCABO (DE )?(COMANDO|ENGATE|TRAMB|SELETOR|MUDANCA|EMBR|TRANSMI)|\bCOXIM (DO )?CAMBIO|\bJUNTA (DO )?CAMBIO|\bROL(AMENTO)? (DO )?CAMBIO|\bROL CAMBIO|\bPLATO|\bDISCO (DE )?EMBR|\bFLEX(IVEL)? (DE )?EMBR|\bTUBO FLEX EMBR|\bCRUZETA|\bCARDAN|\bPINHAO|\bCOROA|\bSINCRONIZADOR|\bSELETOR|\bBOLA (DE )?CAMBIO|\bVARAO|\bBUCHA (DO )?TRAMB|\bSUPORTE (DO )?TRAMB|\bPONTA (DE )?EIXO|\bROL(AMENTO)? (DO )?SEMI|\bRELACAO|\bCAMBIO\b|\bTRANSMISSAO|\bDIFERENCIAL|\bKIT (ALAVANCA|TRAMB)|\bCABO (DE )?EMB|\bANEL SINCRONIZ|\bEMBREGEM|\bCANO TUBO FLEX/, "transmissao"],

  // Elétrica e ignição
  [/\bBOBINA|\bCABO (DE )?VELA|\bCABOS (DE )?VELA|\bVELA|\bSONDA|\bLAMBDA|\bSENSOR|\bLAMP(ADA)?|\bCHICOTE|\bCONECTOR|\bFUSIVEL|\bPORTA ?FUSIVE|\bRELE|\bBATERIA|\bTERMINAL (DE )?BATERIA|\bCABO (DE )?BATERIA|\bMODULO (DE )?IGN|\bTAMPA (DO )?DISTR|\bROTOR|\bDISTRIBUIDOR|\bPLATINADO|\bREGULADOR (DE )?VOLT|\bINTERRUPTOR|\bCEBOLINHA|\bCOMUTADOR|\bCHAVE (DE )?(SETA|LUZ|IGN|PARTIDA)|\bSOQUETE|\bPLUG|\bPISCA|\bLANTERNA|\bFAROL|\bBUZINA|\bMOTOR (DO )?LIMPADOR|\bBOMBA (DO )?LIMPADOR|\bLIMPADOR|\bESCOVA|\bALTERNADOR|\bARRANQUE|\bMOTOR (DE )?PARTIDA|\bINDUZIDO|\bAUTOMATICO (DO )?ARRANQUE|\bIGNICAO|\bELETR|\bTERMINAL (DE )?VELA|\bCIL(INDRO)? (DE )?IGN|\bCILINDRO IGNICAO|\bCEBOLAO|\bRESISTENCIA|\bVELOCIMETRO(?! CABO)|\bPAINEL|\bLED\b|\bINTERR\b|\bCAIXA (DE )?VACUO|\bREGULADOR (DE )?VOLTAGEM|\bAUXILIAR DE PARTIDA|\bCARREGADOR|\bBOTAO|\bMAQ(UINA)? (DE )?VIDRO|\bMOTOR (DO )?VIDRO|\bLAVADOR|\bDINAMO|\bFIO\b|\bTRIODO|\bCIRCUITO|\bREOSTATO|\bDIODO|\bCENTRAL (ELETR|DE )/, "eletrica"],

  // Ar-condicionado (depois de filtros: "filtro ACD" continua em Filtros)
  [/\bACD\b|\bAR ?-?CONDICIONADO|\bCOMPRESSOR\b|\bEVAPORADOR|\bCONDENSADOR|\bVALV(ULA)? (DE )?EXPANSAO/, "arrefecimento"],

  // Cabos e pedais
  [/\bCABO (DE )?(ACEL|AFOG|ABERT|CAPO|VELOC|ACION|LIMIT|FREIO|CHUPETA|PORTA|TAMPA|BANCO|VIDRO)|\bCABO\b|\bPEDAL|\bMOLA (DO )?ACEL|\bPONTA (DE )?CABO/, "cabos"],

  // Motor (juntas, anéis, bronzinas, coxins, válvulas, bomba de óleo, comando)
  [/\bCOXIM|\bANEIS|\bANEL (DO )?(MOTOR|PISTAO|CAMISA)|\bJUNTA|\bBRONZINA|\bBRONZ\b|\bPISTAO|\bCAMISA|\bVALV(ULA)? (ADM|ESC|DE ADM|DE ESC)|\bVALV(ULA)?S? (DO )?(CABECOTE|MOTOR)|\bCOMANDO (DE )?VALV|\bCOMANDO\b|\bTUCHO|\bBALANCIM|\bPARAFUSO (DO )?CABECOTE|\bCABECOTE|\bCARTER|\bBOMBA (DE )?OLEO|\bPESCADOR|\bVARETA (DE )?(NIVEL|OLEO)|\bVARETA|\bTAMPA (DE |DO )?(OLEO|VALV|CARTER|COMANDO|DISTRIBUICAO|RESPIRO|TUCHO)|\bBUJAO|\bSELO|\bRETENTOR|\bRET\b|\bBIELA|\bVOLANTE|\bENGRENAGEM|\bKIT MOTOR|\bCAPA (DA )?CORREIA|\bARRUELA (DE )?ENCOSTO|\bMANCAL|\bCORRENTE|\bGUIA (DA )?CORRENTE|\bTENSOR (DA )?CORRENTE|\bPOLIA (DO )?VIRA|\bVIRABREQUIM|\bSUPORTE (DO )?COXIM|\bRESTRITOR|\bLIMITADOR|\bMOTOR\b|\bRESPIRO|\bCEBOLINHA (DE )?OLEO|\bINTERRUPTOR (DE )?OLEO|\bSENSOR (DE )?(PRESSAO )?OLEO|\bPROTETOR (DE |DO )?CARTER|\bTAMPA\b|\bMANG(UEIRA)? (DE )?RESPIRO|\bCEBOLINHA OLEO|\bVALVULA (DE )?OLEO|\bVEDACAO|\bO ?RING|\bPAPEL (DE )?JUNTA|\bBLOCO|\bTAMPAO|\bMANG RESP|\bBOCAL (DO )?OLEO|\bRESERVATORIO (DE )?OLEO|\bANEL DA BOMBA/, "motor"],

  // Carroceria e acessórios
  [/\bMACANETA|\bMAC\b|\bFECHADURA|\bFECH\b|\bRETROVISOR|\bPARA ?-?CHOQUE|\bPARACHOQUE|\bAMORT(ECEDOR)? (DA |DE )?(TAMPA|PORTA|CAPO|VIDRO|MALA)|\bMAQ(UINA)? (DE )?VIDRO|\bEMBLEMA|\bCALHA|\bCAPA (DE )?CHUVA|\bLENTE|\bFRISO|\bPALHETA|\bCAPA AUTOMOTIV|\bCAPACETE|\bGRAMPO|\bBORRACHA|\bGUARNICAO|\bPROTETOR|\bTAPETE|\bBANCO|\bCINTO|\bVIDRO|\bGRADE|\bPARALAMA|\bPARA ?-?LAMA|\bCAPO\b|\bPORTA\b|\bLIMPADOR|\bADAPTADOR|\bPUNHO|\bMANIVELA|\bCADEADO|\bTRAVA (DE )?(PORTA|CAPO)|\bMOTO\b|\bCORDAO|\bPRESILHA|\bCLIPS|\bACABAMENTO|\bMOLDURA|\bSPOILER|\bAEROFOLIO|\bALARME|\bSOM\b|\bALTO ?FALANTE|\bANTENA|\bESTEPE|\bMACACO/, "carroceria"],

  // Ferramentas e fixação
  [/\bCHAVE|\bFERRAMENTA|\bALICATE|\bBROCA|\bMACACO|\bREBITE|\bABRACADEIRA|\bABRA\b|\bPARAFUSO|\bPARAF\b|\bPORCA|\bARRUELA|\bPRISIONEIRO|\bCUPILHA|\bPINO\b|\bTRAVA|\bLIXA|\bFITA|\bMARTELO|\bSERRA|\bSOQUETE\b|\bSACA|\bJOGO DE (CHAVE|SOQUETE)|\bTORQUIMETRO|\bMEDIDOR|\bLANTERNA (DE )?LED|\bLUVA|\bESTOJO|\bKIT FERRAMENTA|\bBUCHA (DE )?FIXACAO|\bPORCA (DE )?FIXACAO|\bGRAMPO|\bCONEXAO|\bCOTOVELO|\bNIPLE|\bBUJAO|\bCLIP\b|\bCATRACA|\bCANETA TELESCOPICA|\bTRINCHA|\bREB(ITADOR)? REPUXO|\bREBITADOR|\bPRATELEIRA|\bARQUIVO\b|\bRETIFICA\b|\bBRUCUTU|\bBARRA ROSQUEADA|\bESPATULA|\bPINCEL|\bBANCADA|\bORGANIZADOR/, "ferramentas"],
];

export function normalizarTexto(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9'\/.\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

function primeiraRegra(texto) {
  for (const [regex, dep] of REGRAS) if (regex.test(texto)) return dep;
  return null;
}

// Devolve o id do departamento para um produto do ERP.
export function classificar(grupo, nome) {
  const g = normalizarTexto(grupo);
  const n = normalizarTexto(nome);
  const bruto = String(grupo || "").trim();
  if (!g || GRUPOS_BALDE.test(bruto)) return primeiraRegra(n) || "outras";
  if (GRUPOS_GENERICOS.test(bruto)) return primeiraRegra(n) || primeiraRegra(g) || "outras";
  return primeiraRegra(g) || primeiraRegra(n) || "outras";
}

export function departamento(id) {
  return DEPARTAMENTOS.find((d) => d.id === id) || DEPARTAMENTOS[DEPARTAMENTOS.length - 1];
}
