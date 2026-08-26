#include <gio/gio.h>
#include <glib.h>

#define DBUSMENU_PATH "/org/ayatana/NotificationItem/com_agentlog_pet_tray/Menu"
#define DBUSMENU_INTERFACE "com.canonical.dbusmenu"

typedef struct _AgentLogTrayMainContextDispatch AgentLogTrayMainContextDispatch;
typedef void (*AgentLogTrayMainContextFunc)(gpointer user_data);

AgentLogTrayMainContextDispatch *agentlog_tray_main_context_dispatch_new(
    GMainContext *context,
    AgentLogTrayMainContextFunc callback,
    gpointer user_data);
void agentlog_tray_main_context_dispatch_unref(
    AgentLogTrayMainContextDispatch *dispatch);
void agentlog_tray_main_context_dispatch_deactivate(
    AgentLogTrayMainContextDispatch *dispatch);
gboolean agentlog_tray_dispatch_session_bus_message(
    AgentLogTrayMainContextDispatch *dispatch,
    GDBusMessage *message,
    gboolean incoming);

typedef struct {
  AgentLogTrayMainContextDispatch *dispatch;
  GDBusMessage *message;
  gboolean recognized;
} WorkerCall;

typedef struct {
  GThread *expected_thread;
  GThread *callback_thread;
  guint callback_count;
} CallbackProbe;

static GDBusMessage *about_to_show_message(gint item_id) {
  GDBusMessage *message = g_dbus_message_new_method_call(
      "org.agentlog.Test", DBUSMENU_PATH, DBUSMENU_INTERFACE, "AboutToShow");

  g_dbus_message_set_body(message, g_variant_new("(i)", item_id));
  return message;
}

static gpointer dispatch_from_worker(gpointer user_data) {
  WorkerCall *call = user_data;

  call->recognized = agentlog_tray_dispatch_session_bus_message(
      call->dispatch, call->message, TRUE);
  return NULL;
}

static void record_callback(gpointer user_data) {
  CallbackProbe *probe = user_data;

  probe->callback_thread = g_thread_self();
  probe->callback_count += 1;
}

static void run_worker_call(WorkerCall *call) {
  GThread *worker = g_thread_new("dbus-filter", dispatch_from_worker, call);

  g_thread_join(worker);
}

static void test_remote_menu_opened_runs_on_main_context(void) {
  GMainContext *context = g_main_context_new();
  CallbackProbe probe = {.expected_thread = g_thread_self()};
  AgentLogTrayMainContextDispatch *dispatch =
      agentlog_tray_main_context_dispatch_new(context, record_callback, &probe);
  GDBusMessage *message = about_to_show_message(0);
  WorkerCall call = {.dispatch = dispatch, .message = message};

  run_worker_call(&call);

  g_assert_true(call.recognized);
  g_assert_cmpuint(probe.callback_count, ==, 0);
  g_assert_true(g_main_context_iteration(context, FALSE));
  g_assert_cmpuint(probe.callback_count, ==, 1);
  g_assert_true(probe.callback_thread == probe.expected_thread);

  agentlog_tray_main_context_dispatch_deactivate(dispatch);
  agentlog_tray_main_context_dispatch_unref(dispatch);
  g_object_unref(message);
  g_main_context_unref(context);
}

static void test_queued_menu_opened_is_cancelled_on_teardown(void) {
  GMainContext *context = g_main_context_new();
  CallbackProbe probe = {.expected_thread = g_thread_self()};
  AgentLogTrayMainContextDispatch *dispatch =
      agentlog_tray_main_context_dispatch_new(context, record_callback, &probe);
  GDBusMessage *message = about_to_show_message(0);
  WorkerCall call = {.dispatch = dispatch, .message = message};

  run_worker_call(&call);
  g_assert_true(call.recognized);
  g_assert_true(g_main_context_pending(context));

  agentlog_tray_main_context_dispatch_deactivate(dispatch);
  agentlog_tray_main_context_dispatch_unref(dispatch);

  g_assert_false(g_main_context_pending(context));
  g_assert_false(g_main_context_iteration(context, FALSE));
  g_assert_cmpuint(probe.callback_count, ==, 0);

  g_object_unref(message);
  g_main_context_unref(context);
}

static void test_non_root_about_to_show_is_ignored(void) {
  GMainContext *context = g_main_context_new();
  CallbackProbe probe = {.expected_thread = g_thread_self()};
  AgentLogTrayMainContextDispatch *dispatch =
      agentlog_tray_main_context_dispatch_new(context, record_callback, &probe);
  GDBusMessage *message = about_to_show_message(1);
  WorkerCall call = {.dispatch = dispatch, .message = message};

  run_worker_call(&call);

  g_assert_false(call.recognized);
  g_assert_false(g_main_context_pending(context));
  g_assert_cmpuint(probe.callback_count, ==, 0);

  agentlog_tray_main_context_dispatch_deactivate(dispatch);
  agentlog_tray_main_context_dispatch_unref(dispatch);
  g_object_unref(message);
  g_main_context_unref(context);
}

int main(int argc, char **argv) {
  g_test_init(&argc, &argv, NULL);
  g_test_add_func(
      "/main-context/remote-menu-opened",
      test_remote_menu_opened_runs_on_main_context);
  g_test_add_func(
      "/main-context/queued-teardown",
      test_queued_menu_opened_is_cancelled_on_teardown);
  g_test_add_func(
      "/main-context/non-root-ignored",
      test_non_root_about_to_show_is_ignored);
  return g_test_run();
}
