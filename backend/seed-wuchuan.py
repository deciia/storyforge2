#!/usr/bin/env python3
"""Seed StoryForge2 backend with 无船驶向之城 from Obsidian source material."""
import os, sys, time, json, urllib.request

BACKEND = r'C:\Users\Administrator\repos-test\storyforge2\backend'
sys.path.insert(0, BACKEND)

import importlib.util
spec = importlib.util.spec_from_file_location('hermes_client', os.path.join(BACKEND, 'hermes_client.py'))
sf2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sf2)

BASE_DIR = r'C:\Sync\SyncDeciia\ObsidianNotes\moonlightGarden\40-领域\写作\虚构写作\写作项目\长篇小说《无船驶向之城》-20221019122035P'
MANUSCRIPT_DIR = os.path.join(BASE_DIR, '《无船》手稿目录')

now = int(time.time() * 1000)

print("1️⃣ CREATE PROJECT")
p = sf2.create('projects', {
    'name': '无船驶向之城',
    'genre': 'kehuan',
    'genres': json.dumps(['kehuan', 'moshi']),
    'status': 'ongoing',
    'description': '上元病毒导致人类即将灭绝，幸存者聚集在无船港——一个船形的人工岛屿。新人类寿命只有三十年，老人靠长生药剂续命。纪元166年，故事开始。',
    'targetWordCount': 800000,
    'creativeMode': 'fantasy',
    'createdAt': now,
    'updatedAt': now,
})
if 'id' not in p:
    print(f'❌ CREATE PROJECT FAILED: {p}')
    sys.exit(1)
projectId = p['id']
print(f'  projectId = {projectId}')


print("2️⃣ CREATE WORLDVIEW (设定书全文)")
with open(os.path.join(BASE_DIR, 'D 背景及世界构建', '《无船》设定书.md'), 'r', encoding='utf-8') as f:
    setting_text = f.read()
sf2.create('worldviews', {
    'projectId': projectId,
    'data': json.dumps({'fullText': setting_text}),
    'createdAt': now,
    'updatedAt': now,
})


print("3️⃣ CREATE 4 VOLUMES")
volumes = [
    ('第一章 无云穹下的葬礼', 1, 6, '无云穹下的葬礼'),
    ('第二章 无痛苦自成方圆', 7, 11, '无痛苦自成方圆'),
    ('第三章 无边落木萧萧下', 12, 16, '无边落木萧萧下'),
    ('第四章 无法涅槃之凤鸟', 17, 20, '无法涅槃之凤鸟'),
]
volume_ids = []
for idx, (name, start_ch, end_ch, vol_slug) in enumerate(volumes):
    v = sf2.create('outlineNodes', {
        'projectId': projectId,
        'parentId': None,
        'sortOrder': idx + 1,
        'type': 'volume',
        'data': json.dumps({'title': name, 'summary': '', 'startChapter': start_ch, 'endChapter': end_ch}),
        'createdAt': now,
        'updatedAt': now,
    })
    assert 'id' in v, f'create outlineNode failed: {v}'
    volume_ids.append(v.get('id'))

print("4️⃣ CREATE 20 CHAPTERS")
chapter_ids = []
for ch_num in range(1, 21):
    vol_idx = 0 if ch_num <= 6 else (1 if ch_num <= 11 else (2 if ch_num <= 16 else 3))
    vol_slug = volumes[vol_idx][3]
    ch_file = os.path.join(MANUSCRIPT_DIR, f'{ch_num:02d} {vol_slug}.md')
    if not os.path.exists(ch_file):
        print(f'  ⚠️ ch{ch_num:02d} FILE NOT FOUND: {ch_file}')
        content = ''
        read_time = 0
    else:
        with open(ch_file, 'r', encoding='utf-8') as f:
            content = f.read()
        read_time = len(content.replace(' ', '')) if content else 0
        print(f'  ch{ch_num:02d} {vol_slug} → {read_time} 字符')
    if 'read_time' not in dir():
        read_time = 0
    c = sf2.create('chapters', {
        'projectId': projectId,
        'outlineNodeId': volume_ids[vol_idx],
        'sortOrder': ch_num,
        'status': 'completed',
        'data': json.dumps({'title': f'第{ch_num}节', 'content': content, 'readTime': read_time}),
        'createdAt': now,
        'updatedAt': now,
    })
    chapter_ids.append(c.get('id'))
    print(f'  ch{ch_num:02d} → id={c.get("id")} ({read_time} 字符)')


print("5️⃣ CREATE 10 CHARACTERS")
characters = [
    {'name': '陆山酒', 'role': 'protagonist', 'roleWeight': 'main', 'moralAxis': 'good', 'orderAxis': 'neutral',
     'shortDescription': '男主角，38岁，陆家族长克隆体。原X计划初代实验体，现为代族长。收养很多孩子。', 'background': '表面沉著冷静内心惶恐不安。挺过三十大限，拥有妻子栖梧，不知道自己有亲生孩子方儿。'},
    {'name': '陆栖梧', 'role': 'supporting', 'roleWeight': 'main', 'moralAxis': 'good', 'orderAxis': 'neutral',
     'shortDescription': '女主角，29岁，女扮男装。原名方彤嫣，来自被迫害的家族。为山酒带来长生血清。', 'background': '身体为女性但从小以中性男性身份生活。家族被灭后族长收养。'},
    {'name': '方儿', 'role': 'supporting', 'roleWeight': 'secondary', 'moralAxis': 'good', 'orderAxis': 'neutral',
     'shortDescription': '山酒的孩子，7岁。全名方纤白。百年来第一个有性繁殖后代。感染上元3号病毒最多活15年。', 'background': '在研究所长大，被多次拐卖却完好无损。被研究员解救。'},
    {'name': '陆培林', 'role': 'supporting', 'roleWeight': 'main', 'moralAxis': 'good', 'orderAxis': 'lawful',
     'shortDescription': '家族族长，220岁。智者两面派。易延年的义子。伦理委员会创始人。', 'background': '曾担任议长。建立学院、完善探险队体系。X计划领导者。公开与议长对立。'},
    {'name': '陆思嗣', 'role': 'supporting', 'roleWeight': 'secondary', 'moralAxis': 'good', 'orderAxis': 'neutral',
     'shortDescription': '家族幼弟，25岁。X计划最终实验体。体弱早逝。将长生血清给了山酒。', 'background': '从小体弱多病，爱栖梧，把自己唯一的生存机会让给了哥哥。'},
    {'name': '陆阳木', 'role': 'supporting', 'roleWeight': 'secondary', 'moralAxis': 'neutral', 'orderAxis': 'lawful',
     'shortDescription': '易延年秘密藏起的陆家后代，23岁。人类工厂培育室负责人。', 'background': '陆培林克隆体之子。曾去旧大陆机械城。在陆培林政变失败后控制临时议会。'},
    {'name': '钱万益', 'role': 'supporting', 'roleWeight': 'secondary', 'moralAxis': 'neutral', 'orderAxis': 'chaotic',
     'shortDescription': '特殊人类，42岁。金色右眼能影响情绪。地下组织"晨星"创始人。', 'background': '实验室度过大限后逃出。受过陆培林恩惠。与易延年有血缘关系。'},
    {'name': '叶溪亭', 'role': 'supporting', 'roleWeight': 'secondary', 'moralAxis': 'good', 'orderAxis': 'lawful',
     'shortDescription': '水叶教创始人，247岁。原名沃特·佛利伍兹。纳米机器人治愈莱姆病后发现新病毒。', 'background': '治好了易延年的病。建立水叶医疗中心后被传统派利用成有名无权的教皇。'},
    {'name': '易延年', 'role': 'antagonist', 'roleWeight': 'main', 'moralAxis': 'evil', 'orderAxis': 'lawful',
     'shortDescription': '大反派，251岁。老人议会议长。上元病毒设计者。毁灭世界的元凶。', 'background': '经历家庭变故后对人类本质产生怀疑，创造"无性长生"世界。希望有人阻止自己。'},
    {'name': '折耳', 'role': 'minor', 'roleWeight': 'secondary', 'moralAxis': 'good', 'orderAxis': 'neutral',
     'shortDescription': '半机器化猫人，水叶教牧师，20岁。编号zer0→"zer"。曾是研究员。', 'background': '跟随探险队的牧师。采集方儿血液发现长生素含量异常。带猫人进入无船港。'},
]
for ch in characters:
    c = sf2.create('characters', {
        'projectId': projectId,
        'name': ch['name'],
        'role': ch['role'],
        'roleWeight': ch['roleWeight'],
        'moralAxis': ch['moralAxis'],
        'orderAxis': ch['orderAxis'],
        'shortDescription': ch['shortDescription'],
        'background': ch['background'],
        'createdAt': now, 'updatedAt': now,
    })

print("6️⃣ VERIFY")
r = sf2.list('projects')
found = any(p.get('name') == '无船驶向之城' for p in r)
print(f'  project: {"✅" if found else "❌"}')
r = sf2.list('outlineNodes', projectId)
print(f'  outlineNodes: {len(r)} (expected 4)')
r = sf2.list('chapters', projectId)
print(f'  chapters: {len(r)} (expected 20)')
r = sf2.list('characters', projectId)
print(f'  characters: {len(r)} (expected 10)')

print(f'\n{"="*40}')
print(f'✅ 播种完成！')
print(f'  projectId: {projectId}')
print(f'  4 卷 + 20 章 + 10 角色 + 世界设定')
print(f'{"="*40}')
