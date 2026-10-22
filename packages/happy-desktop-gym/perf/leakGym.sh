#!/bin/zsh
# One isolated leak-gym run: clones the fixture, starts the perf daemon and the perf web host with
# the memory probe preloaded, and runs the session gym with PERF_MODE=leak. See README.md.
#
# Env: PERF_FIXTURE (pristine/, home/, fakefs/, browser-profile/), PERF_AGENT_REPO (a happy-agent
# checkout with its gym built), PERF_RENDERER_DIR (a renderer build, perf/vite.names.config.ts),
# PERF_RUN_DIR (a new, short directory: the daemon socket lives in it), PERF_PORT, PERF_SEED,
# PERF_LEAK_MINUTES, PERF_EXTRA_PROVIDERS. `leakGym.sh daemon` starts only the daemon, over the
# run's data as it is; the gym uses it to restart the daemon mid-run.
set -eu
SCRIPT=${0:A}
GYM=${SCRIPT:h:h}
RUN=${PERF_RUN_DIR:?}
SOCKET=$RUN/h/agent/server.sock
if (( ${#SOCKET} > 103 )); then echo "PERF_RUN_DIR is too long for the daemon socket: $SOCKET" >&2; exit 1; fi
export PERF_PROBE_DIR=$RUN/probe

daemon() {
  rm -f $RUN/scratch/daemon.json
  (
    export HOME=$RUN PERF_HAPPY_HOME=$RUN/h PERF_SCRATCH=$RUN/scratch PERF_SQL_STATS=0 PERF_PROBE_ROLE=daemon
    export PERF_EXTRA_PROVIDERS=${PERF_EXTRA_PROVIDERS:-'{}'}
    cd ${PERF_AGENT_REPO:?}/packages/happy-agent-gym
    nohup node --expose-gc --import tsx --import $GYM/perf/leakProbe.ts perf/serve.ts >> $RUN/daemon.log 2>&1 &
    echo $! > $RUN/daemon.pid
  )
  for i in {1..600}; do [[ -f $RUN/scratch/daemon.json ]] && return 0; sleep 0.1; done
  echo "The perf daemon did not start:" >&2; tail -20 $RUN/daemon.log >&2; return 1
}
if [[ ${1:-} == daemon ]]; then daemon; exit; fi

FIXTURE=${PERF_FIXTURE:?}
if curl -s -o /dev/null http://127.0.0.1:${PERF_PORT:-5199}/; then echo "Port ${PERF_PORT:-5199} is already serving; pick another PERF_PORT." >&2; exit 1; fi
rm -rf $RUN
mkdir -p $RUN/h/agent $RUN/Happy/Config $RUN/scratch $PERF_PROBE_DIR
cp -c $FIXTURE/pristine/agent.sqlite $FIXTURE/pristine/auto-agent.sqlite $RUN/h/agent/
cp $FIXTURE/home/.happy/agent/runtime.toml $RUN/h/agent/
cp $FIXTURE/home/Happy/Config/{AGENTS.md,SECURITY.md,mcp.toml} $RUN/Happy/Config/
printf '[features]\ncross_workspace = true\n' > $RUN/Happy/Config/happy.toml
cp $FIXTURE/home/.happy/desktop/config.json $RUN/desktop.json
# Agents work in folders under the fixture; the clone points them at a copy of their own.
cp -R $FIXTURE/fakefs $RUN/fakefs
python3 - $RUN/h/agent/agent.sqlite "$FIXTURE/fakefs/" "$RUN/fakefs/" <<'EOF'
import sqlite3, sys
db, old, new = sys.argv[1:]
c = sqlite3.connect(db)
for table, columns in [("happy_agent_module_workspaces", ["path", "git_common_dir"]), ("happy_agent_module_projects", ["repository_ref"]),
                       ("happy_agent_module_bots", ["path"]), ("happy_agent_module_tasks", ["path"]), ("happy_agent_values", ["value_json"]),
                       ("happy_agent_goal_state", ["value_json"]), ("happy_agent_global_skills", ["state_json"]), ("happy_user_input_requests", ["request_json"])]:
    for column in columns:
        c.execute(f"UPDATE {table} SET {column}=replace({column},?,?) WHERE {column} LIKE ?", (old, new, f"%{old}%"))
c.commit()
EOF

cleanup() {
  [[ -f $RUN/web.pid ]] && kill $(cat $RUN/web.pid) 2>/dev/null || true
  [[ -f $RUN/daemon.pid ]] && kill -INT $(cat $RUN/daemon.pid) 2>/dev/null || true
  [[ -f $RUN/caffeinate.pid ]] && kill $(cat $RUN/caffeinate.pid) 2>/dev/null || true
}
trap cleanup EXIT
# A host that sleeps mid-run stops every process at once; keep it awake for this run only.
# The run still checks the power log and voids itself if the lid closed anyway. (No -u: it
# declares user activity for five seconds and exits.)
caffeinate -dims -w $$ &
echo $! > $RUN/caffeinate.pid
daemon
(
  export HOME=$RUN HAPPY_AGENT_SERVER_SOCKET_PATH=$SOCKET HAPPY_AGENT_SERVER_TOKEN_PATH=$RUN/h/agent/token \
    PORT=${PERF_PORT:-5199} PERF_RENDERER_DIR=${PERF_RENDERER_DIR:?} PERF_DESKTOP_CONFIG=$RUN/desktop.json PERF_PROBE_ROLE=web
  cd $GYM/../happy-desktop-electron
  nohup node --expose-gc --import tsx --import $GYM/perf/leakProbe.ts perf/serveWeb.ts > $RUN/web.log 2>&1 &
  echo $! > $RUN/web.pid
)
for i in {1..100}; do curl -s http://127.0.0.1:${PERF_PORT:-5199}/__happy_local_happy_agent/health > /dev/null && break; sleep 0.2; done

cd $GYM
PERF_MODE=leak PERF_URL=http://127.0.0.1:${PERF_PORT:-5199}/ PERF_SOCKET=$SOCKET PERF_TOKEN=$RUN/h/agent/token \
PERF_SCRATCH=$RUN/scratch PERF_PROFILE=$FIXTURE/browser-profile PERF_DAEMON_PID=$(cat $RUN/daemon.pid) \
PERF_DAEMON_START="$SCRIPT daemon" PERF_DAEMON_PIDFILE=$RUN/daemon.pid PERF_LABEL=${PERF_LABEL:-leak} PERF_OUT=$RUN/result.json \
  node --import tsx perf/sessionGym.ts 2>&1 | tee $RUN/gym.log
exit ${pipestatus[1]}
