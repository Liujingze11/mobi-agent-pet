#include <gio/gio.h>
#include <glib.h>
#include <stdlib.h>

#define WATCHER_NAME "org.kde.StatusNotifierWatcher"
#define WATCHER_PATH "/StatusNotifierWatcher"
#define WATCHER_INTERFACE "org.kde.StatusNotifierWatcher"

typedef struct {
  GMainLoop *loop;
  GDBusConnection *connection;
  guint registration_id;
  guint attempts;
  gchar *item_service;
  gchar *item_path;
} HostState;

static const gchar watcher_xml[] =
    "<node>"
    " <interface name='org.kde.StatusNotifierWatcher'>"
    "  <method name='RegisterStatusNotifierItem'>"
    "   <arg name='service' type='s' direction='in'/>"
    "  </method>"
    "  <method name='RegisterStatusNotifierHost'>"
    "   <arg name='service' type='s' direction='in'/>"
    "  </method>"
    "  <property name='RegisteredStatusNotifierItems' type='as' access='read'/>"
    "  <property name='IsStatusNotifierHostRegistered' type='b' access='read'/>"
    "  <property name='ProtocolVersion' type='i' access='read'/>"
    "  <signal name='StatusNotifierItemRegistered'>"
    "   <arg name='service' type='s'/>"
    "  </signal>"
    "  <signal name='StatusNotifierItemUnregistered'>"
    "   <arg name='service' type='s'/>"
    "  </signal>"
    "  <signal name='StatusNotifierHostRegistered'/>"
    " </interface>"
    "</node>";

static gint find_menu_item(GVariant *layout, const gchar *wanted_label) {
  GVariant *properties;
  GVariant *children;
  GVariantIter child_iterator;
  GVariant *boxed_child;
  const gchar *label = NULL;
  gint item_id;

  g_variant_get(layout, "(i@a{sv}@av)", &item_id, &properties, &children);
  if (g_variant_lookup(properties, "label", "&s", &label) &&
      g_strcmp0(label, wanted_label) == 0) {
    g_variant_unref(properties);
    g_variant_unref(children);
    return item_id;
  }

  g_variant_iter_init(&child_iterator, children);
  while ((boxed_child = g_variant_iter_next_value(&child_iterator)) != NULL) {
    GVariant *child = g_variant_get_variant(boxed_child);
    gint found = find_menu_item(child, wanted_label);

    g_variant_unref(child);
    g_variant_unref(boxed_child);
    if (found >= 0) {
      g_variant_unref(properties);
      g_variant_unref(children);
      return found;
    }
  }
  g_variant_unref(properties);
  g_variant_unref(children);
  return -1;
}

static gboolean activate_registered_item(gpointer data) {
  HostState *state = data;
  GError *error = NULL;
  GVariant *property_result;
  GVariant *boxed_menu;
  GVariant *menu_value;
  GVariantBuilder property_names;
  GVariant *layout_result;
  GVariant *layout;
  gchar *menu_path = NULL;
  guint revision;
  gint item_id;
  GVariant *event_result;

  state->attempts += 1;
  property_result = g_dbus_connection_call_sync(
      state->connection,
      state->item_service,
      state->item_path,
      "org.freedesktop.DBus.Properties",
      "Get",
      g_variant_new("(ss)", "org.kde.StatusNotifierItem", "Menu"),
      G_VARIANT_TYPE("(v)"),
      G_DBUS_CALL_FLAGS_NONE,
      500,
      NULL,
      &error);
  if (property_result == NULL) goto retry;

  g_variant_get(property_result, "(@v)", &boxed_menu);
  menu_value = g_variant_get_variant(boxed_menu);
  menu_path = g_variant_dup_string(menu_value, NULL);
  g_variant_builder_init(&property_names, G_VARIANT_TYPE("as"));
  g_variant_builder_add(&property_names, "s", "label");
  layout_result = g_dbus_connection_call_sync(
      state->connection,
      state->item_service,
      menu_path,
      "com.canonical.dbusmenu",
      "GetLayout",
      g_variant_new("(ii@as)", 0, -1, g_variant_builder_end(&property_names)),
      G_VARIANT_TYPE("(u(ia{sv}av))"),
      G_DBUS_CALL_FLAGS_NONE,
      500,
      NULL,
      &error);
  g_variant_unref(menu_value);
  g_variant_unref(boxed_menu);
  g_variant_unref(property_result);
  if (layout_result == NULL) goto retry;

  g_variant_get(layout_result, "(u@(ia{sv}av))", &revision, &layout);
  item_id = find_menu_item(layout, "Settings");
  g_variant_unref(layout);
  g_variant_unref(layout_result);
  if (item_id < 0) {
    g_set_error_literal(&error, G_IO_ERROR, G_IO_ERROR_NOT_FOUND, "Settings menu item not found");
    goto retry;
  }

  event_result = g_dbus_connection_call_sync(
      state->connection,
      state->item_service,
      menu_path,
      "com.canonical.dbusmenu",
      "Event",
      g_variant_new("(isvu)", item_id, "clicked", g_variant_new_int32(0), 0U),
      NULL,
      G_DBUS_CALL_FLAGS_NONE,
      500,
      NULL,
      &error);
  if (event_result == NULL) goto retry;
  g_variant_unref(event_result);
  g_free(menu_path);
  g_print("ACTIVATED\n");
  g_main_loop_quit(state->loop);
  return G_SOURCE_REMOVE;

retry:
  g_free(menu_path);
  g_clear_error(&error);
  if (state->attempts < 30) return G_SOURCE_CONTINUE;
  g_printerr("status-notifier-host: failed to activate registered menu item\n");
  g_main_loop_quit(state->loop);
  return G_SOURCE_REMOVE;
}

static GVariant *get_watcher_property(GDBusConnection *connection,
                                      const gchar *sender,
                                      const gchar *object_path,
                                      const gchar *interface_name,
                                      const gchar *property_name,
                                      GError **error,
                                      gpointer user_data) {
  HostState *state = user_data;
  const gchar *registered_items[2] = {NULL, NULL};

  (void)connection;
  (void)sender;
  (void)object_path;
  (void)interface_name;
  (void)error;
  if (g_str_equal(property_name, "IsStatusNotifierHostRegistered")) {
    return g_variant_new_boolean(TRUE);
  }
  if (g_str_equal(property_name, "ProtocolVersion")) return g_variant_new_int32(0);
  if (g_str_equal(property_name, "RegisteredStatusNotifierItems")) {
    registered_items[0] = state->item_service;
    return g_variant_new_strv(registered_items, state->item_service == NULL ? 0 : 1);
  }
  return NULL;
}

static void handle_watcher_method(GDBusConnection *connection,
                                  const gchar *sender,
                                  const gchar *object_path,
                                  const gchar *interface_name,
                                  const gchar *method_name,
                                  GVariant *parameters,
                                  GDBusMethodInvocation *invocation,
                                  gpointer user_data) {
  HostState *state = user_data;

  (void)object_path;
  (void)interface_name;
  if (g_str_equal(method_name, "RegisterStatusNotifierItem")) {
    const gchar *service;

    g_variant_get(parameters, "(&s)", &service);
    g_free(state->item_service);
    g_free(state->item_path);
    if (g_str_has_prefix(service, "/")) {
      state->item_service = g_strdup(sender);
      state->item_path = g_strdup(service);
    } else {
      state->item_service = g_strdup(service);
      state->item_path = g_strdup("/StatusNotifierItem");
    }
    g_dbus_method_invocation_return_value(invocation, NULL);
    g_dbus_connection_emit_signal(connection,
                                  NULL,
                                  WATCHER_PATH,
                                  WATCHER_INTERFACE,
                                  "StatusNotifierItemRegistered",
                                  g_variant_new("(s)", service),
                                  NULL);
    g_print("REGISTERED\n");
    g_timeout_add(100, activate_registered_item, state);
    return;
  }
  if (g_str_equal(method_name, "RegisterStatusNotifierHost")) {
    g_dbus_method_invocation_return_value(invocation, NULL);
    g_dbus_connection_emit_signal(connection,
                                  NULL,
                                  WATCHER_PATH,
                                  WATCHER_INTERFACE,
                                  "StatusNotifierHostRegistered",
                                  NULL,
                                  NULL);
    return;
  }
  g_dbus_method_invocation_return_dbus_error(
      invocation, "org.kde.StatusNotifierWatcher.UnknownMethod", "Unknown method");
}

static const GDBusInterfaceVTable watcher_vtable = {
    .method_call = handle_watcher_method,
    .get_property = get_watcher_property,
    .set_property = NULL,
};

static void on_bus_acquired(GDBusConnection *connection,
                            const gchar *name,
                            gpointer user_data) {
  HostState *state = user_data;
  GDBusNodeInfo *node_info;
  GError *error = NULL;

  (void)name;
  state->connection = g_object_ref(connection);
  node_info = g_dbus_node_info_new_for_xml(watcher_xml, &error);
  if (node_info == NULL) {
    g_printerr("status-notifier-host: invalid introspection: %s\n", error->message);
    g_clear_error(&error);
    g_main_loop_quit(state->loop);
    return;
  }
  state->registration_id = g_dbus_connection_register_object(
      connection,
      WATCHER_PATH,
      node_info->interfaces[0],
      &watcher_vtable,
      state,
      NULL,
      &error);
  g_dbus_node_info_unref(node_info);
  if (state->registration_id == 0) {
    g_printerr("status-notifier-host: registration failed: %s\n", error->message);
    g_clear_error(&error);
    g_main_loop_quit(state->loop);
  }
}

static void on_name_acquired(GDBusConnection *connection,
                             const gchar *name,
                             gpointer user_data) {
  (void)connection;
  (void)name;
  (void)user_data;
  g_print("READY\n");
}

static void on_name_lost(GDBusConnection *connection,
                         const gchar *name,
                         gpointer user_data) {
  HostState *state = user_data;

  (void)connection;
  (void)name;
  g_printerr("status-notifier-host: watcher name lost\n");
  g_main_loop_quit(state->loop);
}

int main(void) {
  HostState state = {0};
  guint owner_id;

  state.loop = g_main_loop_new(NULL, FALSE);
  owner_id = g_bus_own_name(G_BUS_TYPE_SESSION,
                            WATCHER_NAME,
                            G_BUS_NAME_OWNER_FLAGS_NONE,
                            on_bus_acquired,
                            on_name_acquired,
                            on_name_lost,
                            &state,
                            NULL);
  g_main_loop_run(state.loop);

  g_bus_unown_name(owner_id);
  if (state.connection != NULL && state.registration_id != 0) {
    g_dbus_connection_unregister_object(state.connection, state.registration_id);
  }
  g_clear_object(&state.connection);
  g_clear_pointer(&state.item_service, g_free);
  g_clear_pointer(&state.item_path, g_free);
  g_main_loop_unref(state.loop);
  return state.attempts >= 30 ? EXIT_FAILURE : EXIT_SUCCESS;
}
