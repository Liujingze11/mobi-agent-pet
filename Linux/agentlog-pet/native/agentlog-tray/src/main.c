#include <gio/gio.h>
#include <glib.h>
#include <json-glib/json-glib.h>
#include <math.h>
#include <string.h>

#ifndef AGENTLOG_TRAY_TEST
#include <errno.h>
#include <glib-unix.h>
#include <gtk/gtk.h>
#include <libayatana-appindicator/app-indicator.h>
#include <signal.h>
#include <sys/prctl.h>
#include <sys/types.h>
#include <unistd.h>
#endif

#define AGENTLOG_TRAY_LINE_BYTES 65536
#define AGENTLOG_TRAY_MENU_DEPTH 3
#define AGENTLOG_TRAY_JSON_DEPTH 9
#define AGENTLOG_TRAY_MENU_ITEMS 64
#define AGENTLOG_TRAY_LABEL_CHARS 160
#define AGENTLOG_TRAY_COMMAND_ID_CHARS 80
#define AGENTLOG_TRAY_MAX_REVISION G_GUINT64_CONSTANT(9007199254740991)
#define DBUSMENU_PATH "/org/ayatana/NotificationItem/com_agentlog_pet_tray/Menu"
#define DBUSMENU_INTERFACE "com.canonical.dbusmenu"

typedef enum {
  PROTOCOL_INVALID_MESSAGE,
  PROTOCOL_WRONG_VERSION,
  PROTOCOL_UNKNOWN_MESSAGE_TYPE,
  PROTOCOL_FORBIDDEN_KEY,
  PROTOCOL_UNKNOWN_FIELD,
  PROTOCOL_INVALID_FIELD,
  PROTOCOL_INVALID_REVISION,
  PROTOCOL_STALE_REVISION,
  PROTOCOL_INVALID_ICON,
  PROTOCOL_INVALID_ICON_THEME_ROOT,
  PROTOCOL_MENU_TOO_DEEP,
  PROTOCOL_MENU_TOO_MANY_ITEMS,
  PROTOCOL_LABEL_TOO_LONG,
  PROTOCOL_COMMAND_ID_TOO_LONG,
  PROTOCOL_DUPLICATE_COMMAND_ID,
  PROTOCOL_LINE_TOO_LARGE,
  PROTOCOL_MALFORMED_JSON,
} AgentLogTrayProtocolError;

typedef struct {
  guint count;
  GHashTable *command_ids;
} MenuValidationState;

static const gchar *protocol_error_codes[] = {
    "invalid-message",
    "wrong-version",
    "unknown-message-type",
    "forbidden-key",
    "unknown-field",
    "invalid-field",
    "invalid-revision",
    "stale-revision",
    "invalid-icon",
    "invalid-icon-theme-root",
    "menu-too-deep",
    "menu-too-many-items",
    "label-too-long",
    "command-id-too-long",
    "duplicate-command-id",
    "line-too-large",
    "malformed-json",
};

static GQuark agentlog_tray_protocol_error_quark(void) {
  return g_quark_from_static_string("agentlog-tray-protocol-error");
}

static gboolean protocol_fail(GError **error,
                              AgentLogTrayProtocolError code,
                              const gchar *message) {
  g_set_error_literal(error, agentlog_tray_protocol_error_quark(), code, message);
  return FALSE;
}

const gchar *agentlog_tray_protocol_error_code(const GError *error) {
  if (error == NULL || error->domain != agentlog_tray_protocol_error_quark() ||
      error->code < 0 || (guint)error->code >= G_N_ELEMENTS(protocol_error_codes)) {
    return "internal-error";
  }
  return protocol_error_codes[error->code];
}

static gboolean is_string_node(JsonNode *node) {
  return node != NULL && JSON_NODE_HOLDS_VALUE(node) &&
         json_node_get_value_type(node) == G_TYPE_STRING;
}

static gboolean is_boolean_node(JsonNode *node) {
  return node != NULL && JSON_NODE_HOLDS_VALUE(node) &&
         json_node_get_value_type(node) == G_TYPE_BOOLEAN;
}

static gboolean node_to_safe_revision(JsonNode *node, guint64 *revision) {
  GType value_type;

  if (node == NULL || !JSON_NODE_HOLDS_VALUE(node)) return FALSE;
  value_type = json_node_get_value_type(node);
  if (value_type == G_TYPE_INT64) {
    gint64 value = json_node_get_int(node);
    if (value < 0 || (guint64)value > AGENTLOG_TRAY_MAX_REVISION) return FALSE;
    *revision = (guint64)value;
    return TRUE;
  }
  if (value_type == G_TYPE_DOUBLE) {
    gdouble value = json_node_get_double(node);
    if (!isfinite(value) || value < 0 || value > AGENTLOG_TRAY_MAX_REVISION ||
        floor(value) != value) {
      return FALSE;
    }
    *revision = (guint64)value;
    return TRUE;
  }
  return FALSE;
}

static gboolean key_is_allowed(const gchar *key, const gchar *const *allowed) {
  for (guint index = 0; allowed[index] != NULL; index += 1) {
    if (g_str_equal(key, allowed[index])) return TRUE;
  }
  return FALSE;
}

static gboolean check_keys(JsonObject *object,
                           const gchar *const *allowed,
                           GError **error) {
  GList *members = json_object_get_members(object);

  for (GList *member = members; member != NULL; member = member->next) {
    const gchar *key = member->data;
    if (key_is_allowed(key, allowed)) continue;
    g_list_free(members);
    if (g_str_equal(key, "click") || g_str_equal(key, "path") ||
        g_str_equal(key, "command")) {
      return protocol_fail(error, PROTOCOL_FORBIDDEN_KEY, "forbidden key");
    }
    return protocol_fail(error, PROTOCOL_UNKNOWN_FIELD, "unknown field");
  }
  g_list_free(members);
  return TRUE;
}

static const gchar *required_string(JsonObject *object,
                                    const gchar *field,
                                    guint max_chars,
                                    GError **error) {
  JsonNode *node = json_object_get_member(object, field);
  const gchar *value;

  if (!is_string_node(node)) {
    protocol_fail(error, PROTOCOL_INVALID_FIELD, "field must be a non-empty string");
    return NULL;
  }
  value = json_node_get_string(node);
  if (value == NULL || value[0] == '\0') {
    protocol_fail(error, PROTOCOL_INVALID_FIELD, "field must be a non-empty string");
    return NULL;
  }
  if (max_chars > 0 && g_utf8_strlen(value, -1) > (glong)max_chars) {
    protocol_fail(error,
                  g_str_equal(field, "id") ? PROTOCOL_COMMAND_ID_TOO_LONG
                                             : PROTOCOL_LABEL_TOO_LONG,
                  "field is too long");
    return NULL;
  }
  return value;
}

static gboolean optional_boolean(JsonObject *object,
                                 const gchar *field,
                                 GError **error) {
  JsonNode *node;

  if (!json_object_has_member(object, field)) return TRUE;
  node = json_object_get_member(object, field);
  if (!is_boolean_node(node)) {
    return protocol_fail(error, PROTOCOL_INVALID_FIELD, "field must be boolean");
  }
  return TRUE;
}

static gboolean validate_icon(JsonObject *object, GError **error) {
  JsonNode *node = json_object_get_member(object, "icon");
  const gchar *icon;

  if (!is_string_node(node)) {
    return protocol_fail(error, PROTOCOL_INVALID_ICON, "unsupported icon name");
  }
  icon = json_node_get_string(node);
  if (!g_str_equal(icon, "agentlog-pet") &&
      !g_str_equal(icon, "agentlog-pet-attention")) {
    return protocol_fail(error, PROTOCOL_INVALID_ICON, "unsupported icon name");
  }
  return TRUE;
}

static gboolean required_revision(JsonObject *object,
                                  guint64 current_revision,
                                  guint64 *revision,
                                  GError **error) {
  if (current_revision > AGENTLOG_TRAY_MAX_REVISION ||
      !node_to_safe_revision(json_object_get_member(object, "revision"), revision)) {
    return protocol_fail(error,
                         PROTOCOL_INVALID_REVISION,
                         "revision must be a safe nonnegative integer");
  }
  if (*revision < current_revision) {
    return protocol_fail(error, PROTOCOL_STALE_REVISION, "revision is stale");
  }
  return TRUE;
}

static gboolean validate_items(JsonNode *items_node,
                               MenuValidationState *state,
                               guint depth,
                               GError **error) {
  JsonArray *items;
  guint length;

  if (items_node == NULL || !JSON_NODE_HOLDS_ARRAY(items_node)) {
    return protocol_fail(error, PROTOCOL_INVALID_FIELD, "items must be an array");
  }
  if (depth > AGENTLOG_TRAY_MENU_DEPTH) {
    return protocol_fail(error, PROTOCOL_MENU_TOO_DEEP, "menu nesting is too deep");
  }

  items = json_node_get_array(items_node);
  length = json_array_get_length(items);
  for (guint index = 0; index < length; index += 1) {
    static const gchar *const separator_keys[] = {"kind", NULL};
    static const gchar *const submenu_keys[] = {
        "kind", "label", "enabled", "items", NULL};
    static const gchar *const command_keys[] = {
        "kind", "id", "label", "enabled", NULL};
    static const gchar *const toggle_keys[] = {
        "kind", "id", "label", "enabled", "checked", NULL};
    JsonNode *item_node = json_array_get_element(items, index);
    JsonObject *item;
    JsonNode *kind_node;
    const gchar *kind;
    const gchar *id;
    const gchar *const *allowed;

    state->count += 1;
    if (state->count > AGENTLOG_TRAY_MENU_ITEMS) {
      return protocol_fail(error,
                           PROTOCOL_MENU_TOO_MANY_ITEMS,
                           "menu has too many items");
    }
    if (item_node == NULL || !JSON_NODE_HOLDS_OBJECT(item_node)) {
      return protocol_fail(error, PROTOCOL_INVALID_MESSAGE, "message must be an object");
    }
    item = json_node_get_object(item_node);
    kind_node = json_object_get_member(item, "kind");
    if (!is_string_node(kind_node)) {
      return protocol_fail(error, PROTOCOL_INVALID_FIELD, "unknown menu item kind");
    }
    kind = json_node_get_string(kind_node);
    if (g_str_equal(kind, "separator")) {
      allowed = separator_keys;
    } else if (g_str_equal(kind, "submenu")) {
      allowed = submenu_keys;
    } else if (g_str_equal(kind, "command")) {
      allowed = command_keys;
    } else if (g_str_equal(kind, "checkbox") || g_str_equal(kind, "radio")) {
      allowed = toggle_keys;
    } else {
      return protocol_fail(error, PROTOCOL_INVALID_FIELD, "unknown menu item kind");
    }
    if (!check_keys(item, allowed, error)) return FALSE;
    if (g_str_equal(kind, "separator")) continue;

    if (!g_str_equal(kind, "submenu")) {
      id = required_string(item, "id", AGENTLOG_TRAY_COMMAND_ID_CHARS, error);
      if (id == NULL) return FALSE;
      if (g_hash_table_contains(state->command_ids, id)) {
        return protocol_fail(error,
                             PROTOCOL_DUPLICATE_COMMAND_ID,
                             "duplicate command ID");
      }
      g_hash_table_add(state->command_ids, g_strdup(id));
    }
    if (required_string(item, "label", AGENTLOG_TRAY_LABEL_CHARS, error) == NULL) {
      return FALSE;
    }
    if (!optional_boolean(item, "enabled", error) ||
        !optional_boolean(item, "checked", error)) {
      return FALSE;
    }
    if (g_str_equal(kind, "submenu") &&
        !validate_items(json_object_get_member(item, "items"), state, depth + 1, error)) {
      return FALSE;
    }
  }
  return TRUE;
}

static gboolean validate_menu(JsonNode *items_node, GError **error) {
  MenuValidationState state = {
      .count = 0,
      .command_ids = g_hash_table_new_full(g_str_hash, g_str_equal, g_free, NULL),
  };
  gboolean valid = validate_items(items_node, &state, 0, error);

  g_hash_table_unref(state.command_ids);
  return valid;
}

static gboolean validate_envelope(JsonObject *object,
                                  const gchar **message_type,
                                  GError **error) {
  guint64 version;
  JsonNode *type_node;
  const gchar *type;

  if (!node_to_safe_revision(json_object_get_member(object, "version"), &version) ||
      version != 1) {
    return protocol_fail(error, PROTOCOL_WRONG_VERSION, "unsupported protocol version");
  }
  type_node = json_object_get_member(object, "type");
  if (!is_string_node(type_node)) {
    return protocol_fail(error,
                         PROTOCOL_UNKNOWN_MESSAGE_TYPE,
                         "unsupported message type");
  }
  type = json_node_get_string(type_node);
  if (!g_str_equal(type, "init") && !g_str_equal(type, "replace-menu") &&
      !g_str_equal(type, "set-icon") && !g_str_equal(type, "shutdown")) {
    return protocol_fail(error,
                         PROTOCOL_UNKNOWN_MESSAGE_TYPE,
                         "unsupported message type");
  }
  *message_type = type;
  return TRUE;
}

static gboolean validate_parent_object(JsonObject *object,
                                       guint64 menu_revision,
                                       guint64 icon_revision,
                                       const gchar *expected_icon_theme_root,
                                       GError **error) {
  static const gchar *const init_keys[] = {
      "version", "type", "revision", "productId", "tooltip",
      "iconThemeRoot", "icon", "items", NULL};
  static const gchar *const replace_menu_keys[] = {
      "version", "type", "revision", "items", NULL};
  static const gchar *const set_icon_keys[] = {
      "version", "type", "revision", "icon", NULL};
  static const gchar *const shutdown_keys[] = {"version", "type", NULL};
  const gchar *message_type;
  const gchar *icon_theme_root;
  guint64 revision;

  if (!validate_envelope(object, &message_type, error)) return FALSE;
  if (g_str_equal(message_type, "init")) {
    if (!check_keys(object, init_keys, error)) return FALSE;
    icon_theme_root = required_string(object, "iconThemeRoot", 0, error);
    if (icon_theme_root == NULL) return FALSE;
    if (expected_icon_theme_root == NULL || expected_icon_theme_root[0] == '\0' ||
        !g_str_equal(icon_theme_root, expected_icon_theme_root)) {
      return protocol_fail(error,
                           PROTOCOL_INVALID_ICON_THEME_ROOT,
                           "icon theme root is not the expected packaged root");
    }
    if (!required_revision(object,
                           MAX(menu_revision, icon_revision),
                           &revision,
                           error) ||
        required_string(object, "productId", 0, error) == NULL ||
        required_string(object, "tooltip", 0, error) == NULL ||
        !validate_icon(object, error) ||
        !validate_menu(json_object_get_member(object, "items"), error)) {
      return FALSE;
    }
    return TRUE;
  }
  if (g_str_equal(message_type, "replace-menu")) {
    return check_keys(object, replace_menu_keys, error) &&
           required_revision(object, menu_revision, &revision, error) &&
           validate_menu(json_object_get_member(object, "items"), error);
  }
  if (g_str_equal(message_type, "set-icon")) {
    return check_keys(object, set_icon_keys, error) &&
           required_revision(object, icon_revision, &revision, error) &&
           validate_icon(object, error);
  }
  return check_keys(object, shutdown_keys, error);
}

static gboolean strict_json_fail(GError **error) {
  return protocol_fail(error, PROTOCOL_MALFORMED_JSON, "line is not valid JSON");
}

static gboolean is_json_line_whitespace(guint8 byte) {
  return byte == ' ' || byte == '\t' || byte == '\r';
}

static gboolean is_json_value_delimiter(guint8 byte) {
  return is_json_line_whitespace(byte) || byte == ',' || byte == ']' || byte == '}';
}

static gboolean scan_json_string(const guint8 *bytes,
                                 gsize length,
                                 gsize *offset,
                                 GError **error) {
  gsize cursor = *offset + 1;

  while (cursor < length) {
    guint8 byte = bytes[cursor];

    if (byte == '"') {
      *offset = cursor + 1;
      return TRUE;
    }
    if (byte == '\\') {
      guint8 escape;

      if (length - cursor < 2) return strict_json_fail(error);
      escape = bytes[cursor + 1];
      if (escape == '"' || escape == '\\' || escape == '/' || escape == 'b' ||
          escape == 'f' || escape == 'n' || escape == 'r' || escape == 't') {
        cursor += 2;
        continue;
      }
      if (escape != 'u' || length - cursor < 6) return strict_json_fail(error);

      gunichar value = 0;
      for (gsize index = cursor + 2; index < cursor + 6; index += 1) {
        gint digit = g_ascii_xdigit_value((gchar)bytes[index]);

        if (digit < 0) return strict_json_fail(error);
        value = (value << 4) | (gunichar)digit;
      }
      if (value == 0) return strict_json_fail(error);
      cursor += 6;
      continue;
    }
    if (byte < 0x20) return strict_json_fail(error);
    if (byte < 0x80) {
      cursor += 1;
      continue;
    }

    gunichar value = g_utf8_get_char_validated(
        (const gchar *)bytes + cursor, (gssize)(length - cursor));
    if (value == (gunichar)-1 || value == (gunichar)-2) {
      return strict_json_fail(error);
    }
    cursor += (gsize)g_utf8_skip[byte];
  }
  return strict_json_fail(error);
}

static gboolean scan_json_literal(const guint8 *bytes,
                                  gsize length,
                                  gsize *offset,
                                  const gchar *literal,
                                  GError **error) {
  gsize literal_length = strlen(literal);
  gsize cursor = *offset;

  if (length - cursor < literal_length ||
      memcmp(bytes + cursor, literal, literal_length) != 0) {
    return strict_json_fail(error);
  }
  cursor += literal_length;
  if (cursor < length && !is_json_value_delimiter(bytes[cursor])) {
    return strict_json_fail(error);
  }
  *offset = cursor;
  return TRUE;
}

static gboolean scan_json_number(const guint8 *bytes,
                                 gsize length,
                                 gsize *offset,
                                 GError **error) {
  gsize cursor = *offset;

  if (bytes[cursor] == '-') cursor += 1;
  if (cursor >= length) return strict_json_fail(error);
  if (bytes[cursor] == '0') {
    cursor += 1;
    if (cursor < length && g_ascii_isdigit((gchar)bytes[cursor])) {
      return strict_json_fail(error);
    }
  } else if (bytes[cursor] >= '1' && bytes[cursor] <= '9') {
    do {
      cursor += 1;
    } while (cursor < length && g_ascii_isdigit((gchar)bytes[cursor]));
  } else {
    return strict_json_fail(error);
  }

  if (cursor < length && bytes[cursor] == '.') {
    cursor += 1;
    if (cursor >= length || !g_ascii_isdigit((gchar)bytes[cursor])) {
      return strict_json_fail(error);
    }
    do {
      cursor += 1;
    } while (cursor < length && g_ascii_isdigit((gchar)bytes[cursor]));
  }
  if (cursor < length && (bytes[cursor] == 'e' || bytes[cursor] == 'E')) {
    cursor += 1;
    if (cursor < length && (bytes[cursor] == '+' || bytes[cursor] == '-')) {
      cursor += 1;
    }
    if (cursor >= length || !g_ascii_isdigit((gchar)bytes[cursor])) {
      return strict_json_fail(error);
    }
    do {
      cursor += 1;
    } while (cursor < length && g_ascii_isdigit((gchar)bytes[cursor]));
  }
  if (cursor < length && !is_json_value_delimiter(bytes[cursor])) {
    return strict_json_fail(error);
  }
  *offset = cursor;
  return TRUE;
}

static gboolean preflight_strict_json_line(const gchar *line,
                                           gsize length,
                                           GError **error) {
  const guint8 *bytes = (const guint8 *)line;
  guint8 containers[AGENTLOG_TRAY_JSON_DEPTH];
  guint depth = 0;
  gsize offset = 0;

  while (offset < length) {
    guint8 byte = bytes[offset];

    if (is_json_line_whitespace(byte) || byte == ':' || byte == ',') {
      offset += 1;
      continue;
    }
    if (byte == '{' || byte == '[') {
      if (depth >= AGENTLOG_TRAY_JSON_DEPTH) {
        return protocol_fail(
            error, PROTOCOL_MENU_TOO_DEEP, "JSON nesting is too deep");
      }
      containers[depth] = byte;
      depth += 1;
      offset += 1;
      continue;
    }
    if (byte == '}' || byte == ']') {
      guint8 expected = byte == '}' ? '{' : '[';

      if (depth == 0 || containers[depth - 1] != expected) {
        return strict_json_fail(error);
      }
      depth -= 1;
      offset += 1;
      continue;
    }
    if (byte == '"') {
      if (!scan_json_string(bytes, length, &offset, error)) return FALSE;
      continue;
    }
    if (byte == 't') {
      if (!scan_json_literal(bytes, length, &offset, "true", error)) return FALSE;
      continue;
    }
    if (byte == 'f') {
      if (!scan_json_literal(bytes, length, &offset, "false", error)) return FALSE;
      continue;
    }
    if (byte == 'n') {
      if (!scan_json_literal(bytes, length, &offset, "null", error)) return FALSE;
      continue;
    }
    if (byte == '-' || g_ascii_isdigit((gchar)byte)) {
      if (!scan_json_number(bytes, length, &offset, error)) return FALSE;
      continue;
    }
    return strict_json_fail(error);
  }
  return depth == 0 ? TRUE : strict_json_fail(error);
}

JsonNode *agentlog_tray_parse_parent_message(const gchar *line,
                                             gsize length,
                                             guint64 menu_revision,
                                             guint64 icon_revision,
                                             const gchar *expected_icon_theme_root,
                                             GError **error) {
  JsonParser *parser;
  GError *parse_error = NULL;
  JsonNode *root;
  JsonNode *result;

  g_return_val_if_fail(error == NULL || *error == NULL, NULL);
  if (line == NULL) {
    protocol_fail(error, PROTOCOL_INVALID_MESSAGE, "message must be an object");
    return NULL;
  }
  if (length >= AGENTLOG_TRAY_LINE_BYTES) {
    protocol_fail(error, PROTOCOL_LINE_TOO_LARGE, "line is too large");
    return NULL;
  }
  if (!preflight_strict_json_line(line, length, error)) return NULL;

  parser = json_parser_new();
  if (!json_parser_load_from_data(parser, line, (gssize)length, &parse_error)) {
    g_clear_error(&parse_error);
    g_object_unref(parser);
    protocol_fail(error, PROTOCOL_MALFORMED_JSON, "line is not valid JSON");
    return NULL;
  }
  root = json_parser_get_root(parser);
  if (root == NULL || !JSON_NODE_HOLDS_OBJECT(root)) {
    g_object_unref(parser);
    protocol_fail(error, PROTOCOL_INVALID_MESSAGE, "message must be an object");
    return NULL;
  }
  if (!validate_parent_object(json_node_get_object(root),
                              menu_revision,
                              icon_revision,
                              expected_icon_theme_root,
                              error)) {
    g_object_unref(parser);
    return NULL;
  }

  result = json_node_copy(root);
  g_object_unref(parser);
  return result;
}

typedef void (*AgentLogTrayMainContextFunc)(gpointer user_data);

typedef struct _AgentLogTrayMainContextDispatch {
  gint references;
  GMutex mutex;
  GMainContext *context;
  GSource *source;
  guint pending_count;
  gboolean active;
  AgentLogTrayMainContextFunc callback;
  gpointer user_data;
} AgentLogTrayMainContextDispatch;

static AgentLogTrayMainContextDispatch *agentlog_tray_main_context_dispatch_ref(
    AgentLogTrayMainContextDispatch *dispatch) {
  g_atomic_int_inc(&dispatch->references);
  return dispatch;
}

void agentlog_tray_main_context_dispatch_unref(
    AgentLogTrayMainContextDispatch *dispatch) {
  if (!g_atomic_int_dec_and_test(&dispatch->references)) return;
  g_assert_null(dispatch->source);
  g_main_context_unref(dispatch->context);
  g_mutex_clear(&dispatch->mutex);
  g_free(dispatch);
}

static void destroy_main_context_dispatch(gpointer user_data) {
  agentlog_tray_main_context_dispatch_unref(user_data);
}

static gboolean run_main_context_dispatch(gpointer user_data) {
  AgentLogTrayMainContextDispatch *dispatch = user_data;
  AgentLogTrayMainContextFunc callback = NULL;
  gpointer callback_data = NULL;
  guint pending_count = 0;

  g_mutex_lock(&dispatch->mutex);
  dispatch->source = NULL;
  if (dispatch->active) {
    callback = dispatch->callback;
    callback_data = dispatch->user_data;
    pending_count = dispatch->pending_count;
  }
  dispatch->pending_count = 0;
  g_mutex_unlock(&dispatch->mutex);

  for (guint index = 0; index < pending_count; index += 1) {
    callback(callback_data);
  }
  return G_SOURCE_REMOVE;
}

AgentLogTrayMainContextDispatch *agentlog_tray_main_context_dispatch_new(
    GMainContext *context,
    AgentLogTrayMainContextFunc callback,
    gpointer user_data) {
  AgentLogTrayMainContextDispatch *dispatch = g_new0(
      AgentLogTrayMainContextDispatch, 1);

  dispatch->references = 1;
  g_mutex_init(&dispatch->mutex);
  dispatch->context = g_main_context_ref(context);
  dispatch->active = TRUE;
  dispatch->callback = callback;
  dispatch->user_data = user_data;
  return dispatch;
}

static gboolean schedule_main_context_dispatch(
    AgentLogTrayMainContextDispatch *dispatch) {
  gboolean scheduled = FALSE;

  g_mutex_lock(&dispatch->mutex);
  if (dispatch->active) {
    dispatch->pending_count += 1;
    if (dispatch->source == NULL) {
      GSource *source = g_idle_source_new();

      g_source_set_callback(
          source,
          run_main_context_dispatch,
          agentlog_tray_main_context_dispatch_ref(dispatch),
          destroy_main_context_dispatch);
      dispatch->source = source;
      g_source_attach(source, dispatch->context);
      g_source_unref(source);
    }
    scheduled = TRUE;
  }
  g_mutex_unlock(&dispatch->mutex);
  return scheduled;
}

void agentlog_tray_main_context_dispatch_deactivate(
    AgentLogTrayMainContextDispatch *dispatch) {
  g_mutex_lock(&dispatch->mutex);
  dispatch->active = FALSE;
  dispatch->callback = NULL;
  dispatch->user_data = NULL;
  dispatch->pending_count = 0;
  if (dispatch->source != NULL) {
    g_source_destroy(dispatch->source);
    dispatch->source = NULL;
  }
  g_mutex_unlock(&dispatch->mutex);
}

gboolean agentlog_tray_dispatch_session_bus_message(
    AgentLogTrayMainContextDispatch *dispatch,
    GDBusMessage *message,
    gboolean incoming) {
  GVariant *body;
  gint item_id;

  if (!incoming ||
      g_dbus_message_get_message_type(message) != G_DBUS_MESSAGE_TYPE_METHOD_CALL ||
      g_strcmp0(g_dbus_message_get_path(message), DBUSMENU_PATH) != 0 ||
      g_strcmp0(g_dbus_message_get_interface(message), DBUSMENU_INTERFACE) != 0 ||
      g_strcmp0(g_dbus_message_get_member(message), "AboutToShow") != 0) {
    return FALSE;
  }

  body = g_dbus_message_get_body(message);
  if (body == NULL || !g_variant_is_of_type(body, G_VARIANT_TYPE("(i)"))) {
    return FALSE;
  }
  g_variant_get(body, "(i)", &item_id);
  return item_id == 0 && schedule_main_context_dispatch(dispatch);
}

#ifndef AGENTLOG_TRAY_TEST

#define WATCHER_NAME "org.kde.StatusNotifierWatcher"
#define WATCHER_PATH "/StatusNotifierWatcher"
#define WATCHER_INTERFACE "org.kde.StatusNotifierWatcher"

typedef struct {
  guint64 menu_revision;
  guint64 icon_revision;
  AppIndicator *indicator;
  GtkWidget *menu;
  gchar *icon_theme_root;
  GHashTable *command_ids;
  GIOChannel *stdin_channel;
  GByteArray *stdin_buffer;
  GDBusConnection *session_bus;
  guint stdin_watch_id;
  guint signal_watch_id;
  guint watcher_watch_id;
  guint property_watch_id;
  guint menu_filter_id;
  guint host_probe_id;
  AgentLogTrayMainContextDispatch *menu_opened_dispatch;
  gboolean initialized;
  gboolean menu_open;
  gboolean host_status_known;
  gboolean host_watcher;
  gboolean host_registered;
  gboolean terminating;
  gint exit_code;
} AgentLogTrayState;

static gboolean write_stdout(const gchar *data, gsize length) {
  gsize offset = 0;

  while (offset < length) {
    ssize_t written = write(STDOUT_FILENO, data + offset, length - offset);
    if (written > 0) {
      offset += (gsize)written;
      continue;
    }
    if (written < 0 && errno == EINTR) continue;
    return FALSE;
  }
  return TRUE;
}

static gboolean emit_builder(JsonBuilder *builder) {
  JsonGenerator *generator = json_generator_new();
  JsonNode *root = json_builder_get_root(builder);
  gchar *json;
  gchar *line;
  gsize length;
  gboolean written;

  json_generator_set_root(generator, root);
  json = json_generator_to_data(generator, &length);
  json_node_unref(root);
  g_object_unref(generator);
  if (length + 1 > AGENTLOG_TRAY_LINE_BYTES) {
    g_free(json);
    return FALSE;
  }
  line = g_strconcat(json, "\n", NULL);
  written = write_stdout(line, length + 1);
  g_free(line);
  g_free(json);
  return written;
}

static gboolean emit_simple(const gchar *type) {
  JsonBuilder *builder = json_builder_new();
  gboolean emitted;

  json_builder_begin_object(builder);
  json_builder_set_member_name(builder, "version");
  json_builder_add_int_value(builder, 1);
  json_builder_set_member_name(builder, "type");
  json_builder_add_string_value(builder, type);
  json_builder_end_object(builder);
  emitted = emit_builder(builder);
  g_object_unref(builder);
  return emitted;
}

static gboolean emit_ready(void) {
  JsonBuilder *builder = json_builder_new();
  gboolean emitted;

  json_builder_begin_object(builder);
  json_builder_set_member_name(builder, "version");
  json_builder_add_int_value(builder, 1);
  json_builder_set_member_name(builder, "type");
  json_builder_add_string_value(builder, "ready");
  json_builder_set_member_name(builder, "backend");
  json_builder_add_string_value(builder, "ayatana");
  json_builder_end_object(builder);
  emitted = emit_builder(builder);
  g_object_unref(builder);
  return emitted;
}

static gboolean emit_host_status(gboolean watcher, gboolean registered) {
  JsonBuilder *builder = json_builder_new();
  gboolean emitted;

  json_builder_begin_object(builder);
  json_builder_set_member_name(builder, "version");
  json_builder_add_int_value(builder, 1);
  json_builder_set_member_name(builder, "type");
  json_builder_add_string_value(builder, "host-status");
  json_builder_set_member_name(builder, "watcher");
  json_builder_add_boolean_value(builder, watcher);
  json_builder_set_member_name(builder, "registered");
  json_builder_add_boolean_value(builder, registered);
  json_builder_end_object(builder);
  emitted = emit_builder(builder);
  g_object_unref(builder);
  return emitted;
}

static gboolean emit_command(guint64 revision, const gchar *id) {
  JsonBuilder *builder = json_builder_new();
  gboolean emitted;

  json_builder_begin_object(builder);
  json_builder_set_member_name(builder, "version");
  json_builder_add_int_value(builder, 1);
  json_builder_set_member_name(builder, "type");
  json_builder_add_string_value(builder, "command");
  json_builder_set_member_name(builder, "revision");
  json_builder_add_int_value(builder, (gint64)revision);
  json_builder_set_member_name(builder, "id");
  json_builder_add_string_value(builder, id);
  json_builder_end_object(builder);
  emitted = emit_builder(builder);
  g_object_unref(builder);
  return emitted;
}

static gboolean emit_protocol_error(const gchar *code, const gchar *message) {
  JsonBuilder *builder = json_builder_new();
  gchar *bounded_message;
  gboolean emitted;

  bounded_message = g_utf8_strlen(message, -1) > AGENTLOG_TRAY_LABEL_CHARS
                        ? g_utf8_substring(message, 0, AGENTLOG_TRAY_LABEL_CHARS)
                        : g_strdup(message);
  json_builder_begin_object(builder);
  json_builder_set_member_name(builder, "version");
  json_builder_add_int_value(builder, 1);
  json_builder_set_member_name(builder, "type");
  json_builder_add_string_value(builder, "error");
  json_builder_set_member_name(builder, "code");
  json_builder_add_string_value(builder, code);
  json_builder_set_member_name(builder, "message");
  json_builder_add_string_value(builder, bounded_message);
  json_builder_end_object(builder);
  emitted = emit_builder(builder);
  g_free(bounded_message);
  g_object_unref(builder);
  return emitted;
}

static void terminate_helper(AgentLogTrayState *state, gint exit_code) {
  if (state->terminating) return;
  state->terminating = TRUE;
  state->exit_code = exit_code;
  gtk_main_quit();
}

static void fail_helper(AgentLogTrayState *state,
                        const gchar *code,
                        const gchar *message) {
  emit_protocol_error(code, message);
  terminate_helper(state, EXIT_FAILURE);
}

static void on_menu_item_activate(GtkMenuItem *item, gpointer user_data) {
  AgentLogTrayState *state = user_data;
  const gchar *id = g_object_get_data(G_OBJECT(item), "agentlog-command-id");
  guint64 *revision = g_object_get_data(G_OBJECT(item), "agentlog-menu-revision");

  if (id == NULL || revision == NULL ||
      !g_hash_table_contains(state->command_ids, id)) {
    return;
  }
  if (!emit_command(*revision, id)) terminate_helper(state, EXIT_FAILURE);
}

static void on_menu_map(GtkWidget *menu, gpointer user_data) {
  AgentLogTrayState *state = user_data;

  (void)menu;
  if (state->menu_open) return;
  state->menu_open = TRUE;
  if (!emit_simple("menu-opened")) terminate_helper(state, EXIT_FAILURE);
}

static void on_menu_unmap(GtkWidget *menu, gpointer user_data) {
  AgentLogTrayState *state = user_data;

  (void)menu;
  state->menu_open = FALSE;
}

static GtkWidget *build_menu(AgentLogTrayState *state,
                             JsonArray *items,
                             guint64 revision) {
  GtkWidget *menu = gtk_menu_new();
  GSList *radio_group = NULL;
  guint length = json_array_get_length(items);

  for (guint index = 0; index < length; index += 1) {
    JsonObject *descriptor = json_array_get_object_element(items, index);
    const gchar *kind = json_object_get_string_member(descriptor, "kind");
    GtkWidget *item;

    if (g_str_equal(kind, "separator")) {
      item = gtk_separator_menu_item_new();
    } else {
      const gchar *label = json_object_get_string_member(descriptor, "label");

      if (g_str_equal(kind, "checkbox")) {
        item = gtk_check_menu_item_new_with_label(label);
        if (json_object_has_member(descriptor, "checked")) {
          gtk_check_menu_item_set_active(
              GTK_CHECK_MENU_ITEM(item),
              json_object_get_boolean_member(descriptor, "checked"));
        }
      } else if (g_str_equal(kind, "radio")) {
        item = gtk_radio_menu_item_new_with_label(radio_group, label);
        radio_group = gtk_radio_menu_item_get_group(GTK_RADIO_MENU_ITEM(item));
        if (json_object_has_member(descriptor, "checked")) {
          gtk_check_menu_item_set_active(
              GTK_CHECK_MENU_ITEM(item),
              json_object_get_boolean_member(descriptor, "checked"));
        }
      } else {
        item = gtk_menu_item_new_with_label(label);
      }

      if (json_object_has_member(descriptor, "enabled")) {
        gtk_widget_set_sensitive(
            item, json_object_get_boolean_member(descriptor, "enabled"));
      }
      if (g_str_equal(kind, "submenu")) {
        GtkWidget *submenu = build_menu(
            state, json_object_get_array_member(descriptor, "items"), revision);
        gtk_menu_item_set_submenu(GTK_MENU_ITEM(item), submenu);
      } else {
        const gchar *id = json_object_get_string_member(descriptor, "id");
        guint64 *item_revision = g_new(guint64, 1);

        *item_revision = revision;
        g_hash_table_add(state->command_ids, g_strdup(id));
        g_object_set_data_full(
            G_OBJECT(item), "agentlog-command-id", g_strdup(id), g_free);
        g_object_set_data_full(
            G_OBJECT(item), "agentlog-menu-revision", item_revision, g_free);
        g_signal_connect(item, "activate", G_CALLBACK(on_menu_item_activate), state);
      }
    }
    gtk_menu_shell_append(GTK_MENU_SHELL(menu), item);
  }
  return menu;
}

static GtkWidget *build_root_menu(AgentLogTrayState *state,
                                  JsonArray *items,
                                  guint64 revision) {
  GtkWidget *menu;

  g_hash_table_remove_all(state->command_ids);
  state->menu_open = FALSE;
  menu = build_menu(state, items, revision);
  g_signal_connect(menu, "map", G_CALLBACK(on_menu_map), state);
  g_signal_connect(menu, "unmap", G_CALLBACK(on_menu_unmap), state);
  gtk_widget_show_all(menu);
  return menu;
}

static gboolean query_host_status(AgentLogTrayState *state) {
  GError *error = NULL;
  GVariant *owner_result;
  GVariant *property_result = NULL;
  gboolean watcher = FALSE;
  gboolean registered = FALSE;

  if (state->session_bus != NULL) {
    owner_result = g_dbus_connection_call_sync(
        state->session_bus,
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        "GetNameOwner",
        g_variant_new("(s)", WATCHER_NAME),
        G_VARIANT_TYPE("(s)"),
        G_DBUS_CALL_FLAGS_NONE,
        500,
        NULL,
        &error);
    if (owner_result != NULL) {
      watcher = TRUE;
      g_variant_unref(owner_result);
      property_result = g_dbus_connection_call_sync(
          state->session_bus,
          WATCHER_NAME,
          WATCHER_PATH,
          "org.freedesktop.DBus.Properties",
          "Get",
          g_variant_new("(ss)", WATCHER_INTERFACE, "IsStatusNotifierHostRegistered"),
          G_VARIANT_TYPE("(v)"),
          G_DBUS_CALL_FLAGS_NONE,
          500,
          NULL,
          &error);
      if (property_result != NULL) {
        GVariant *boxed;
        GVariant *value;

        g_variant_get(property_result, "(@v)", &boxed);
        value = g_variant_get_variant(boxed);
        if (g_variant_is_of_type(value, G_VARIANT_TYPE_BOOLEAN)) {
          registered = g_variant_get_boolean(value);
        }
        g_variant_unref(value);
        g_variant_unref(boxed);
        g_variant_unref(property_result);
      }
    }
    g_clear_error(&error);
  }

  if (!state->host_status_known || watcher != state->host_watcher ||
      registered != state->host_registered) {
    state->host_status_known = TRUE;
    state->host_watcher = watcher;
    state->host_registered = registered;
    if (!emit_host_status(watcher, registered)) {
      terminate_helper(state, EXIT_FAILURE);
      return FALSE;
    }
  }
  return TRUE;
}

static gboolean run_debounced_host_probe(gpointer user_data) {
  AgentLogTrayState *state = user_data;

  state->host_probe_id = 0;
  query_host_status(state);
  return G_SOURCE_REMOVE;
}

static void schedule_host_probe(AgentLogTrayState *state) {
  if (state->host_probe_id != 0) g_source_remove(state->host_probe_id);
  state->host_probe_id = g_timeout_add(250, run_debounced_host_probe, state);
}

static void on_watcher_appeared(GDBusConnection *connection,
                                const gchar *name,
                                const gchar *name_owner,
                                gpointer user_data) {
  AgentLogTrayState *state = user_data;

  (void)connection;
  (void)name;
  (void)name_owner;
  schedule_host_probe(state);
}

static void on_watcher_vanished(GDBusConnection *connection,
                                const gchar *name,
                                gpointer user_data) {
  AgentLogTrayState *state = user_data;

  (void)connection;
  (void)name;
  schedule_host_probe(state);
}

static void on_watcher_properties_changed(GDBusConnection *connection,
                                          const gchar *sender_name,
                                          const gchar *object_path,
                                          const gchar *interface_name,
                                          const gchar *signal_name,
                                          GVariant *parameters,
                                          gpointer user_data) {
  AgentLogTrayState *state = user_data;

  (void)connection;
  (void)sender_name;
  (void)object_path;
  (void)interface_name;
  (void)signal_name;
  (void)parameters;
  schedule_host_probe(state);
}

static GDBusMessage *on_session_bus_message(GDBusConnection *connection,
                                            GDBusMessage *message,
                                            gboolean incoming,
                                            gpointer user_data) {
  AgentLogTrayMainContextDispatch *dispatch = user_data;

  (void)connection;
  agentlog_tray_dispatch_session_bus_message(dispatch, message, incoming);
  return message;
}

static void emit_remote_menu_opened(gpointer user_data) {
  AgentLogTrayState *state = user_data;

  if (!state->terminating && !emit_simple("menu-opened")) {
    terminate_helper(state, EXIT_FAILURE);
  }
}

static void unref_main_context_dispatch(gpointer user_data) {
  agentlog_tray_main_context_dispatch_unref(user_data);
}

static void start_host_monitor(AgentLogTrayState *state) {
  GError *error = NULL;

  state->session_bus = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
  if (state->session_bus == NULL) {
    g_clear_error(&error);
    query_host_status(state);
    return;
  }
  state->menu_opened_dispatch = agentlog_tray_main_context_dispatch_new(
      g_main_context_default(), emit_remote_menu_opened, state);
  state->menu_filter_id = g_dbus_connection_add_filter(
      state->session_bus,
      on_session_bus_message,
      agentlog_tray_main_context_dispatch_ref(state->menu_opened_dispatch),
      unref_main_context_dispatch);
  state->watcher_watch_id = g_bus_watch_name_on_connection(
      state->session_bus,
      WATCHER_NAME,
      G_BUS_NAME_WATCHER_FLAGS_NONE,
      on_watcher_appeared,
      on_watcher_vanished,
      state,
      NULL);
  state->property_watch_id = g_dbus_connection_signal_subscribe(
      state->session_bus,
      WATCHER_NAME,
      "org.freedesktop.DBus.Properties",
      "PropertiesChanged",
      WATCHER_PATH,
      WATCHER_INTERFACE,
      G_DBUS_SIGNAL_FLAGS_NONE,
      on_watcher_properties_changed,
      state,
      NULL);
  query_host_status(state);
}

static gboolean initialize_indicator(AgentLogTrayState *state, JsonObject *message) {
  guint64 revision;
  GtkWidget *menu;
  const gchar *icon;
  const gchar *tooltip;

  node_to_safe_revision(json_object_get_member(message, "revision"), &revision);
  icon = json_object_get_string_member(message, "icon");
  tooltip = json_object_get_string_member(message, "tooltip");
  menu = build_root_menu(
      state, json_object_get_array_member(message, "items"), revision);
  state->indicator = app_indicator_new(
      "com.agentlog.pet.tray",
      "agentlog-pet",
      APP_INDICATOR_CATEGORY_APPLICATION_STATUS);
  if (state->indicator == NULL) {
    gtk_widget_destroy(menu);
    fail_helper(state, "indicator-init-failed", "Ayatana indicator initialization failed");
    return FALSE;
  }

  state->menu = menu;
  state->menu_revision = revision;
  state->icon_revision = revision;
  app_indicator_set_icon_theme_path(state->indicator, state->icon_theme_root);
  app_indicator_set_icon(state->indicator, icon);
  app_indicator_set_title(state->indicator, tooltip);
  app_indicator_set_status(state->indicator, APP_INDICATOR_STATUS_ACTIVE);
  /* AppIndicator sinks the menu's floating reference; state keeps a borrowed pointer. */
  app_indicator_set_menu(state->indicator, GTK_MENU(state->menu));
  state->initialized = TRUE;
  if (!emit_ready()) {
    terminate_helper(state, EXIT_FAILURE);
    return FALSE;
  }
  start_host_monitor(state);
  return TRUE;
}

static gboolean apply_parent_message(AgentLogTrayState *state, JsonNode *root) {
  JsonObject *message = json_node_get_object(root);
  const gchar *type = json_object_get_string_member(message, "type");

  if (g_str_equal(type, "shutdown")) {
    if (!emit_simple("stopped")) {
      terminate_helper(state, EXIT_FAILURE);
    } else {
      terminate_helper(state, EXIT_SUCCESS);
    }
    return FALSE;
  }
  if (g_str_equal(type, "init")) {
    if (state->initialized) {
      fail_helper(state, "invalid-state", "init was already received");
      return FALSE;
    }
    return initialize_indicator(state, message);
  }
  if (!state->initialized) {
    fail_helper(state, "invalid-state", "init must be received first");
    return FALSE;
  }
  if (g_str_equal(type, "replace-menu")) {
    guint64 revision;

    node_to_safe_revision(json_object_get_member(message, "revision"), &revision);
    state->menu = build_root_menu(
        state, json_object_get_array_member(message, "items"), revision);
    state->menu_revision = revision;
    app_indicator_set_menu(state->indicator, GTK_MENU(state->menu));
    return TRUE;
  }
  if (g_str_equal(type, "set-icon")) {
    guint64 revision;

    node_to_safe_revision(json_object_get_member(message, "revision"), &revision);
    state->icon_revision = revision;
    app_indicator_set_icon(
        state->indicator, json_object_get_string_member(message, "icon"));
  }
  return TRUE;
}

static gboolean process_line(AgentLogTrayState *state,
                             const guint8 *line,
                             gsize length) {
  GError *error = NULL;
  JsonNode *message = agentlog_tray_parse_parent_message(
      (const gchar *)line,
      length,
      state->menu_revision,
      state->icon_revision,
      state->icon_theme_root,
      &error);
  gboolean keep_running;

  if (message == NULL) {
    fail_helper(state, agentlog_tray_protocol_error_code(error), error->message);
    g_clear_error(&error);
    return FALSE;
  }
  keep_running = apply_parent_message(state, message);
  json_node_unref(message);
  return keep_running;
}

static gboolean process_stdin_buffer(AgentLogTrayState *state) {
  while (state->stdin_buffer->len > 0) {
    guint8 *newline = memchr(
        state->stdin_buffer->data, '\n', state->stdin_buffer->len);
    gsize line_length;

    if (newline == NULL) {
      if (state->stdin_buffer->len > AGENTLOG_TRAY_LINE_BYTES) {
        fail_helper(state, "line-too-large", "buffered line is too large");
        return FALSE;
      }
      return TRUE;
    }
    line_length = (gsize)(newline - state->stdin_buffer->data);
    if (line_length + 1 > AGENTLOG_TRAY_LINE_BYTES) {
      fail_helper(state, "line-too-large", "line is too large");
      return FALSE;
    }
    if (!process_line(state, state->stdin_buffer->data, line_length)) return FALSE;
    g_byte_array_remove_range(state->stdin_buffer, 0, line_length + 1);
  }
  return TRUE;
}

static gboolean on_stdin_ready(GIOChannel *channel,
                               GIOCondition condition,
                               gpointer user_data) {
  AgentLogTrayState *state = user_data;
  GIOStatus status = G_IO_STATUS_NORMAL;

  if ((condition & (G_IO_ERR | G_IO_NVAL)) != 0) {
    state->stdin_watch_id = 0;
    terminate_helper(state, EXIT_FAILURE);
    return G_SOURCE_REMOVE;
  }

  do {
    gchar chunk[4096];
    gsize bytes_read = 0;
    GError *error = NULL;

    status = g_io_channel_read_chars(channel, chunk, sizeof(chunk), &bytes_read, &error);
    if (bytes_read > 0) {
      g_byte_array_append(state->stdin_buffer, (const guint8 *)chunk, bytes_read);
      if (!process_stdin_buffer(state)) {
        g_clear_error(&error);
        state->stdin_watch_id = 0;
        return G_SOURCE_REMOVE;
      }
    }
    if (status == G_IO_STATUS_ERROR) {
      g_clear_error(&error);
      state->stdin_watch_id = 0;
      terminate_helper(state, EXIT_FAILURE);
      return G_SOURCE_REMOVE;
    }
    g_clear_error(&error);
  } while (status == G_IO_STATUS_NORMAL);

  if (status == G_IO_STATUS_EOF || (condition & G_IO_HUP) != 0) {
    if (state->stdin_buffer->len > 0) {
      fail_helper(state, "incomplete-line", "input ended before newline");
    } else {
      terminate_helper(state, EXIT_SUCCESS);
    }
    state->stdin_watch_id = 0;
    return G_SOURCE_REMOVE;
  }
  return G_SOURCE_CONTINUE;
}

static gboolean on_termination_signal(gpointer user_data) {
  AgentLogTrayState *state = user_data;

  state->signal_watch_id = 0;
  terminate_helper(state, EXIT_SUCCESS);
  return G_SOURCE_REMOVE;
}

static gchar *derive_icon_theme_root(const gchar *executable) {
  gchar *absolute_executable = g_canonicalize_filename(executable, NULL);
  gchar *binary_directory = g_path_get_dirname(absolute_executable);
  gchar *candidate = g_build_filename(binary_directory, "..", "icons", "hicolor", NULL);
  gchar *root = g_canonicalize_filename(candidate, NULL);

  g_free(candidate);
  g_free(binary_directory);
  g_free(absolute_executable);
  return root;
}

static gboolean arm_parent_death_signal(void) {
  pid_t parent = getppid();

  if (prctl(PR_SET_PDEATHSIG, SIGTERM) != 0) return FALSE;
  return getppid() == parent;
}

static gboolean start_stdin_watch(AgentLogTrayState *state) {
  GError *error = NULL;
  GIOFlags flags;

  state->stdin_channel = g_io_channel_unix_new(STDIN_FILENO);
  g_io_channel_set_close_on_unref(state->stdin_channel, FALSE);
  if (g_io_channel_set_encoding(state->stdin_channel, NULL, &error) != G_IO_STATUS_NORMAL) {
    g_clear_error(&error);
    return FALSE;
  }
  g_io_channel_set_buffered(state->stdin_channel, FALSE);
  flags = g_io_channel_get_flags(state->stdin_channel);
  if (g_io_channel_set_flags(
          state->stdin_channel, flags | G_IO_FLAG_NONBLOCK, &error) != G_IO_STATUS_NORMAL) {
    g_clear_error(&error);
    return FALSE;
  }
  state->stdin_watch_id = g_io_add_watch(
      state->stdin_channel,
      G_IO_IN | G_IO_HUP | G_IO_ERR | G_IO_NVAL,
      on_stdin_ready,
      state);
  return state->stdin_watch_id != 0;
}

static void clear_state(AgentLogTrayState *state) {
  if (state->host_probe_id != 0) g_source_remove(state->host_probe_id);
  if (state->watcher_watch_id != 0) g_bus_unwatch_name(state->watcher_watch_id);
  if (state->session_bus != NULL && state->property_watch_id != 0) {
    g_dbus_connection_signal_unsubscribe(state->session_bus, state->property_watch_id);
  }
  if (state->menu_opened_dispatch != NULL) {
    agentlog_tray_main_context_dispatch_deactivate(state->menu_opened_dispatch);
  }
  if (state->session_bus != NULL && state->menu_filter_id != 0) {
    g_dbus_connection_remove_filter(state->session_bus, state->menu_filter_id);
  }
  if (state->menu_opened_dispatch != NULL) {
    agentlog_tray_main_context_dispatch_unref(state->menu_opened_dispatch);
    state->menu_opened_dispatch = NULL;
  }
  if (state->stdin_watch_id != 0) g_source_remove(state->stdin_watch_id);
  if (state->signal_watch_id != 0) g_source_remove(state->signal_watch_id);
  if (state->indicator != NULL) {
    app_indicator_set_status(state->indicator, APP_INDICATOR_STATUS_PASSIVE);
    state->menu = NULL;
    g_object_unref(state->indicator);
  }
  g_clear_object(&state->session_bus);
  if (state->stdin_channel != NULL) g_io_channel_unref(state->stdin_channel);
  g_clear_pointer(&state->stdin_buffer, g_byte_array_unref);
  g_clear_pointer(&state->command_ids, g_hash_table_unref);
  g_clear_pointer(&state->icon_theme_root, g_free);
}

int main(int argc, char **argv) {
  AgentLogTrayState state = {
      .menu_revision = 0,
      .icon_revision = 0,
      .exit_code = EXIT_SUCCESS,
  };

  if (!arm_parent_death_signal()) return EXIT_FAILURE;
  if (!gtk_init_check(&argc, &argv)) {
    emit_protocol_error("gtk-init-failed", "GTK initialization failed");
    return EXIT_FAILURE;
  }

  state.icon_theme_root = derive_icon_theme_root(argv[0]);
  state.command_ids = g_hash_table_new_full(g_str_hash, g_str_equal, g_free, NULL);
  state.stdin_buffer = g_byte_array_sized_new(4096);
  state.signal_watch_id = g_unix_signal_add(SIGTERM, on_termination_signal, &state);
  if (!start_stdin_watch(&state)) {
    emit_protocol_error("stdin-init-failed", "stdin initialization failed");
    clear_state(&state);
    return EXIT_FAILURE;
  }

  gtk_main();
  clear_state(&state);
  return state.exit_code;
}

#endif
