// Direct engine smoke test (bypasses HTTP while dev server restarts)
import { getDemoProfile } from '@/lib/profile'
import { loadGraphContext, buildGraphHome, searchGraph, buildGraphHub, buildGraphPath, buildExplore } from '@/lib/knowledge-graph'

async function main() {
  const profile = await getDemoProfile()
  console.log('profile:', profile.id)
  const ctx = await loadGraphContext(profile.id)
  console.log('ctx: concepts', ctx.concepts.size, '| verified edges', ctx.edges.length, '| crossSubject', ctx.crossSubjectEdges, '| pairs', ctx.pairsResolved.length, '| insufficient', ctx.insufficientData)

  const home = buildGraphHome(ctx, ['c-heartfail', 'c-htn', 'bogus-id', 'c-ami'])
  console.log('HOME stats:', home.stats)
  console.log('HOME topHubs:', home.topHubs.map(h => `${h.name}(${h.degree},m${h.mastery})`).join(' | '))
  console.log('HOME missingPrereq:', home.personal.missingPrerequisites.map(m => `${m.fromName}→${m.toName} m${m.mastery}`).join(' | '))
  console.log('HOME confusionHotspots:', home.personal.confusionHotspots.map(p => `${p.aName}↔${p.bName} bothWeak=${p.bothWeak}`).join(' | '))
  console.log('HOME isolatedWeak:', home.personal.isolatedWeak.length, '| strongZones:', home.personal.strongZones.map(s => `${s.name}(m${s.mastery},d${s.degree})`).join(' | '))
  console.log('HOME recommendedToday:', home.personal.recommendedToday.map(r => r.name).join(' | '))
  console.log('HOME recentIds:', home.recentIds.join(','))
  console.log('HOME subjects top5:', home.subjects.slice(0, 5).map(s => `${s.code}:${s.conceptCount}c/${s.edgeCount}e`).join(' '))

  const search = searchGraph(ctx, 'hf')
  console.log('SEARCH hf:', search.concepts.map(c => `${c.name} via=${c.matchedVia}${c.matchedTerm ? `/${c.matchedTerm}` : ''}`).join(' | '), '| synHits:', search.synonymHits.map(s => s.term).join(','))
  const search2 = searchGraph(ctx, 'heart')
  console.log('SEARCH heart:', search2.concepts.slice(0, 5).map(c => `${c.name} tier-via=${c.matchedVia}`).join(' | '))
  const search3 = searchGraph(ctx, '')
  console.log('SEARCH empty:', JSON.stringify(search3))
  const search4 = searchGraph(ctx, 'pharma')
  console.log('SEARCH pharma subjects:', search4.subjects.map(s => s.name).join(','), '| synHits:', search4.synonymHits.map(s => s.term).join(','))

  const hub = buildGraphHub(ctx, 'c-heartfail')
  if (hub) {
    console.log('HUB hf groups:', hub.groups.map(g => `${g.kind}(${g.items.length}${g.hidden ? `+${g.hidden}` : ''})`).join(' | '))
    for (const g of hub.groups) console.log(`  ${g.kind}:`, g.items.map(i => `${i.name}[${i.edgeType},m${i.mastery}]`).join(', '))
    console.log('HUB hf mastery:', JSON.stringify(hub.mastery), '| learnStatus:', hub.learnStatus)
    console.log('HUB hf qStats:', JSON.stringify(hub.questionStats), '| cases:', hub.caseCount, '| flashcards:', hub.flashcardCount)
    console.log('HUB minimap:', hub.minimap.nodes.map(n => `${n.name}(${n.group})`).join(', '))
    console.log('HUB personal.recNext:', hub.personal.recommendedNext.map(r => `${r.name} — ${r.reason}`).join(' | '))
    console.log('HUB repeatedConfusion:', JSON.stringify(hub.personal.repeatedConfusion))
    console.log('HUB insufficient:', hub.insufficientData)
  }
  console.log('HUB unknown:', buildGraphHub(ctx, 'nope'))
  const hub2 = buildGraphHub(ctx, 'c-htn')
  if (hub2) console.log('HUB htn groups:', hub2.groups.map(g => `${g.kind}(${g.items.length})`).join(' | '), '| mastery:', JSON.stringify(hub2.mastery))

  const path = buildGraphPath(ctx, 'c-ami')
  if (path) {
    console.log('PATH ami steps:', path.steps.map(s => `${s.stage}(${s.items.length})`).join(' | '))
    console.log('PATH ami narrative:', path.narrative.length, JSON.stringify(path.narrative.slice(0, 4), null, 0))
  }
  const path2 = buildGraphPath(ctx, 'c-heartfail')
  if (path2) console.log('PATH hf steps:', path2.steps.map(s => `${s.stage}(${s.items.length})`).join(' | '), '| narrative:', path2.narrative.length)

  const exp = buildExplore(ctx, 'medicine')
  console.log('EXPLORE medicine subject:', exp.payload.subject?.code, exp.payload.subject?.neetWeight, '| systems:', exp.payload.systems.map(s => `${s.system}(${s.topics.length}t/${s.topics.reduce((a, t) => a + t.conceptCount, 0)}c)`).join(' '))
  const t0 = exp.payload.systems[0]?.topics[0]
  if (t0) console.log('EXPLORE first topic:', t0.name, 'concepts:', t0.concepts.slice(0, 3).map(c => `${c.name}(d${c.degree})`).join(', '))
  const expAll = buildExplore(ctx, null)
  console.log('EXPLORE all systems:', expAll.payload.systems.length, '| subject:', expAll.payload.subject)
  console.log('EXPLORE unknown subject found:', buildExplore(ctx, 'nosuch').subjectFound)
}
main().finally(() => process.exit(0))
