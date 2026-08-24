#include <glib.h>
#include <json-glib/json-glib.h>
#include <string.h>

#define EXPECTED_ICON_ROOT "/opt/agentlog/tray/icons/hicolor"
#define MAX_SAFE_REVISION G_GUINT64_CONSTANT(9007199254740991)

JsonNode *agentlog_tray_parse_parent_message(const gchar *line,
                                             gsize length,
                                             guint64 menu_revision,
                                             guint64 icon_revision,
                                             const gchar *expected_icon_theme_root,
                                             GError **error);
const gchar *agentlog_tray_protocol_error_code(const GError *error);

static const gchar *valid_init =
    "{\"version\":1,\"type\":\"init\",\"revision\":7,"
    "\"productId\":\"com.agentlog.pet\",\"tooltip\":\"AgentLog Pet\","
    "\"iconThemeRoot\":\"" EXPECTED_ICON_ROOT "\",\"icon\":\"agentlog-pet\","
    "\"items\":[{\"kind\":\"command\",\"id\":\"settings.open\","
    "\"label\":\"Settings\",\"enabled\":true}]}";

static JsonNode *parse_message(const gchar *message,
                               guint64 menu_revision,
                               guint64 icon_revision,
                               const gchar *expected_icon_root,
                               GError **error) {
  return agentlog_tray_parse_parent_message(message,
                                            strlen(message),
                                            menu_revision,
                                            icon_revision,
                                            expected_icon_root,
                                            error);
}

static void assert_valid(const gchar *message,
                         guint64 menu_revision,
                         guint64 icon_revision,
                         const gchar *expected_icon_root) {
  GError *error = NULL;
  JsonNode *root = parse_message(message,
                                 menu_revision,
                                 icon_revision,
                                 expected_icon_root,
                                 &error);

  g_assert_no_error(error);
  g_assert_nonnull(root);
  json_node_unref(root);
}

static void assert_invalid(const gchar *message,
                           guint64 menu_revision,
                           guint64 icon_revision,
                           const gchar *expected_icon_root,
                           const gchar *expected_code) {
  GError *error = NULL;
  JsonNode *root = parse_message(message,
                                 menu_revision,
                                 icon_revision,
                                 expected_icon_root,
                                 &error);

  g_assert_null(root);
  g_assert_nonnull(error);
  g_assert_cmpstr(agentlog_tray_protocol_error_code(error), ==, expected_code);
  g_clear_error(&error);
}

static gchar *init_with_items(const gchar *items) {
  return g_strdup_printf(
      "{\"version\":1,\"type\":\"init\",\"revision\":7,"
      "\"productId\":\"com.agentlog.pet\",\"tooltip\":\"AgentLog Pet\","
      "\"iconThemeRoot\":\"%s\",\"icon\":\"agentlog-pet\",\"items\":%s}",
      EXPECTED_ICON_ROOT,
      items);
}

static gchar *nested_items(guint depth) {
  gchar *items = g_strdup(
      "[{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"Settings\"}]");

  for (guint index = 0; index < depth; index += 1) {
    gchar *parent = g_strdup_printf(
        "[{\"kind\":\"submenu\",\"label\":\"Level\",\"items\":%s}]",
        items);
    g_free(items);
    items = parent;
  }
  return items;
}

static gchar *separator_items(guint count) {
  GString *items = g_string_new("[");

  for (guint index = 0; index < count; index += 1) {
    if (index > 0) g_string_append_c(items, ',');
    g_string_append(items, "{\"kind\":\"separator\"}");
  }
  g_string_append_c(items, ']');
  return g_string_free(items, FALSE);
}

static gchar *repeated_utf8(const gchar *character, guint count) {
  GString *value = g_string_sized_new(strlen(character) * count);

  for (guint index = 0; index < count; index += 1) {
    g_string_append(value, character);
  }
  return g_string_free(value, FALSE);
}

static void test_protocol_envelope(void) {
  assert_valid(valid_init, 0, 0, EXPECTED_ICON_ROOT);
  assert_invalid(
      "{\"version\":2,\"type\":\"shutdown\"}", 0, 0, NULL, "wrong-version");
  assert_invalid(
      "{\"version\":1,\"type\":\"launch-shell\"}", 0, 0, NULL, "unknown-message-type");
  assert_invalid("[]", 0, 0, NULL, "invalid-message");
  assert_invalid("{not-json}", 0, 0, NULL, "malformed-json");
}

static void test_icon_allowlist(void) {
  assert_valid(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":8,"
      "\"icon\":\"agentlog-pet\"}",
      0,
      7,
      NULL);
  assert_valid(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":9,"
      "\"icon\":\"agentlog-pet-attention\"}",
      0,
      8,
      NULL);
  assert_invalid(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":9,"
      "\"icon\":\"/tmp/untrusted.png\"}",
      0,
      8,
      NULL,
      "invalid-icon");
}

static void test_revision_bounds(void) {
  gchar *maximum = g_strdup_printf(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":%" G_GUINT64_FORMAT
      ",\"icon\":\"agentlog-pet\"}",
      MAX_SAFE_REVISION);

  assert_valid(maximum, 0, MAX_SAFE_REVISION, NULL);
  assert_invalid(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":-1,"
      "\"icon\":\"agentlog-pet\"}",
      0,
      0,
      NULL,
      "invalid-revision");
  assert_invalid(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":9007199254740992,"
      "\"icon\":\"agentlog-pet\"}",
      0,
      0,
      NULL,
      "invalid-revision");
  assert_invalid(
      "{\"version\":1,\"type\":\"set-icon\",\"revision\":1.5,"
      "\"icon\":\"agentlog-pet\"}",
      0,
      0,
      NULL,
      "invalid-revision");
  assert_invalid(
      "{\"version\":1,\"type\":\"replace-menu\",\"revision\":6,\"items\":[]}",
      7,
      0,
      NULL,
      "stale-revision");
  assert_valid(
      "{\"version\":1,\"type\":\"replace-menu\",\"revision\":7,\"items\":[]}",
      7,
      0,
      NULL);
  g_free(maximum);
}

static void test_descriptor_depth_and_count(void) {
  gchar *depth_three_items = nested_items(3);
  gchar *depth_four_items = nested_items(4);
  gchar *sixty_four_items = separator_items(64);
  gchar *sixty_five_items = separator_items(65);
  gchar *depth_three = init_with_items(depth_three_items);
  gchar *depth_four = init_with_items(depth_four_items);
  gchar *sixty_four = init_with_items(sixty_four_items);
  gchar *sixty_five = init_with_items(sixty_five_items);

  assert_valid(depth_three, 0, 0, EXPECTED_ICON_ROOT);
  assert_invalid(depth_four, 0, 0, EXPECTED_ICON_ROOT, "menu-too-deep");
  assert_valid(sixty_four, 0, 0, EXPECTED_ICON_ROOT);
  assert_invalid(sixty_five, 0, 0, EXPECTED_ICON_ROOT, "menu-too-many-items");

  g_free(depth_three_items);
  g_free(depth_four_items);
  g_free(sixty_four_items);
  g_free(sixty_five_items);
  g_free(depth_three);
  g_free(depth_four);
  g_free(sixty_four);
  g_free(sixty_five);
}

static void test_descriptor_string_limits(void) {
  gchar *label_160 = repeated_utf8("\xF0\x9F\x98\x80", 160);
  gchar *label_161 = repeated_utf8("\xF0\x9F\x98\x80", 161);
  gchar *id_80 = repeated_utf8("x", 80);
  gchar *id_81 = repeated_utf8("x", 81);
  gchar *items = g_strdup_printf(
      "[{\"kind\":\"command\",\"id\":\"%s\",\"label\":\"%s\"}]",
      id_80,
      label_160);
  gchar *valid = init_with_items(items);
  gchar *long_label_items = g_strdup_printf(
      "[{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"%s\"}]",
      label_161);
  gchar *long_label = init_with_items(long_label_items);
  gchar *long_id_items = g_strdup_printf(
      "[{\"kind\":\"command\",\"id\":\"%s\",\"label\":\"Settings\"}]",
      id_81);
  gchar *long_id = init_with_items(long_id_items);

  assert_valid(valid, 0, 0, EXPECTED_ICON_ROOT);
  assert_invalid(long_label, 0, 0, EXPECTED_ICON_ROOT, "label-too-long");
  assert_invalid(long_id, 0, 0, EXPECTED_ICON_ROOT, "command-id-too-long");

  g_free(label_160);
  g_free(label_161);
  g_free(id_80);
  g_free(id_81);
  g_free(items);
  g_free(valid);
  g_free(long_label_items);
  g_free(long_label);
  g_free(long_id_items);
  g_free(long_id);
}

static void test_descriptor_schema(void) {
  gchar *valid_kinds = init_with_items(
      "[{\"kind\":\"separator\"},"
      "{\"kind\":\"checkbox\",\"id\":\"pet.visible\",\"label\":\"Show Pet\","
      "\"enabled\":true,\"checked\":false},"
      "{\"kind\":\"radio\",\"id\":\"mode.auto\",\"label\":\"Auto\","
      "\"checked\":true},"
      "{\"kind\":\"submenu\",\"label\":\"More\",\"enabled\":false,"
      "\"items\":[{\"kind\":\"command\",\"id\":\"settings.open\","
      "\"label\":\"Settings\"}]}]");
  gchar *duplicates = init_with_items(
      "[{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"Settings\"},"
      "{\"kind\":\"submenu\",\"label\":\"More\",\"items\":["
      "{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"Again\"}]}]");
  gchar *forbidden = init_with_items(
      "[{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"Settings\","
      "\"click\":\"exec\"}]");
  gchar *unknown = init_with_items(
      "[{\"kind\":\"command\",\"id\":\"settings.open\",\"label\":\"Settings\","
      "\"color\":\"red\"}]");

  assert_valid(valid_kinds, 0, 0, EXPECTED_ICON_ROOT);
  assert_invalid(duplicates, 0, 0, EXPECTED_ICON_ROOT, "duplicate-command-id");
  assert_invalid(forbidden, 0, 0, EXPECTED_ICON_ROOT, "forbidden-key");
  assert_invalid(unknown, 0, 0, EXPECTED_ICON_ROOT, "unknown-field");
  assert_invalid(
      "{\"version\":1,\"type\":\"replace-menu\",\"revision\":8,\"items\":[],"
      "\"path\":\"/tmp/menu\"}",
      7,
      0,
      NULL,
      "forbidden-key");

  g_free(valid_kinds);
  g_free(duplicates);
  g_free(forbidden);
  g_free(unknown);
}

static void test_icon_theme_root_is_fail_closed(void) {
  assert_valid(valid_init, 0, 0, EXPECTED_ICON_ROOT);
  assert_invalid(valid_init, 0, 0, NULL, "invalid-icon-theme-root");
  assert_invalid(valid_init, 0, 0, "/tmp/untrusted-icons", "invalid-icon-theme-root");
}

static void test_shutdown_schema(void) {
  assert_valid("{\"version\":1,\"type\":\"shutdown\"}", 0, 0, NULL);
  assert_invalid(
      "{\"version\":1,\"type\":\"shutdown\",\"command\":\"quit\"}",
      0,
      0,
      NULL,
      "forbidden-key");
}

static void test_line_limit(void) {
  gchar *oversized = g_malloc0(65537);
  GError *error = NULL;
  JsonNode *root;

  memset(oversized, 'x', 65536);
  root = agentlog_tray_parse_parent_message(oversized, 65536, 0, 0, NULL, &error);
  g_assert_null(root);
  g_assert_nonnull(error);
  g_assert_cmpstr(agentlog_tray_protocol_error_code(error), ==, "line-too-large");
  g_clear_error(&error);
  g_free(oversized);
}

int main(int argc, char **argv) {
  g_test_init(&argc, &argv, NULL);
  g_test_add_func("/protocol/envelope", test_protocol_envelope);
  g_test_add_func("/protocol/icon-allowlist", test_icon_allowlist);
  g_test_add_func("/protocol/revision-bounds", test_revision_bounds);
  g_test_add_func("/protocol/descriptors/depth-and-count", test_descriptor_depth_and_count);
  g_test_add_func("/protocol/descriptors/string-limits", test_descriptor_string_limits);
  g_test_add_func("/protocol/descriptors/schema", test_descriptor_schema);
  g_test_add_func("/protocol/icon-theme-root", test_icon_theme_root_is_fail_closed);
  g_test_add_func("/protocol/shutdown", test_shutdown_schema);
  g_test_add_func("/protocol/line-limit", test_line_limit);
  return g_test_run();
}
