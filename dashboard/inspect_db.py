import sqlite3
import os

p = r'c:\Users\202514190027\Documents\Jobs_Applier_AI_Agent_AIHawk\dashboard\kiwibot.db'
print('EXISTS', os.path.exists(p))
if not os.path.exists(p):
    raise SystemExit(0)

con = sqlite3.connect(p)
cur = con.cursor()
print('USERS')
for row in cur.execute("SELECT id, name, email, role, created_at FROM users ORDER BY created_at").fetchall():
    print(row)
print('COUNT_OPPS', cur.execute("SELECT COUNT(*) FROM opportunities").fetchone()[0])
print('BY_USER')
for row in cur.execute("SELECT user_id, COUNT(*) FROM opportunities GROUP BY user_id ORDER BY COUNT(*) DESC").fetchall():
    print(row)
print('SAMPLE_OPPS')
for row in cur.execute("SELECT id, user_id, company_name, title FROM opportunities ORDER BY created_at LIMIT 10").fetchall():
    print(row)
con.close()
