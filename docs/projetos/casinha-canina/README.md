# Canil CM-01 — caderno de projeto executivo

Projeto de um canil individual (cão de até 35 kg) resolvido em **dois sistemas
construtivos** sobre o mesmo partido arquitetônico e a mesma envoltória externa
de 1,39 × 0,99 m:

- **Método A** — Light Steel Frame sobre radier de concreto armado
- **Método B** — alvenaria estrutural de blocos 14×19×39 sobre sapata corrida

`caderno.html` é a peça completa e autocontida: pranchas PR-01 a PR-06 desenhadas
por código (planta, cortes, elevações, painéis, fiadas e fundação), memória de
cálculo (vento NBR 6123, arrancamento, tombamento, alvenaria), desempenho térmico
NBR 15220-2, quantitativos, orçamento, cronograma e um modelo 3D paramétrico
gerado a partir das mesmas cotas das pranchas.

**Rev. 01** enxugou a construção ao porte do problema: uma única laje de piso de
0,122 m³ no lugar de radier + sapata corrida, vedação do LSF em três camadas,
alvenaria sem embasamento nem reboco e S₃ do vento reclassificado para
edificação acessória. Custo −41%, prazo −38%, concreto −80%, com todas as
verificações do §7 mantidas.

> Fora do escopo do sistema HallaxOS — vive apenas neste branch, não é mergeado
> no `main` e não entra no fluxo de deploy.

## Modelo 3D

O visualizador do §9 monta a casinha peça a peça a partir das mesmas cotas das
pranchas: bloco vazado com furo real, junta de argamassa de 10 mm entre cada
peça, canaleta J/U com o graute e as barras dentro, perfis Ue e U extrudados do
perfil real, chapa trapezoidal com onda de 93 mm e ~145 parafusos e chumbadores
posicionados nos nós. Cada uma das 15 camadas tem três estados (sólido,
transparente, oculto), há corte nos três eixos com posição contínua, explosão na
ordem de montagem, cotas 3D e identificação da peça sob o cursor.
