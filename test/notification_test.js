global.window = require("mithril/test-utils/browserMock.js")();
global.document = window.document;

const assert = require("power-assert");
const sinon = require("sinon");
const Notification = require("../src/notification.js");
const NotificationCache = require("../src/notification_cache.js");

describe("Notification", () => {
  let notification, config, notification_cache, chrome, strage, histories;

  beforeEach(() => {
    histories = [];

    config = {
      addNotifiedHistories: (new_histories) => {
        histories = new_histories;
      },
      isGitLab16_0: () => {
        return true;
      }
    };
    chrome = {
      notifications: {
        create: sinon.spy()
      },
      browserAction: {
        setBadgeText: sinon.spy()
      }
    };
    strage = {};
    notification_cache = new NotificationCache(strage);
    notification = new Notification({
      config: config,
      chrome: chrome,
      notification_cache: notification_cache,
    });
  });

  describe("#notify()", () => {
    let project, project_event, internal, current_time, message, author_id;

    beforeEach(() => {
      project = {
        avatar_url: "https://gitlab.com/uploads/project/avatar/219579/image.jpg",
        events: {
          Commit: true,
          Issue: true,
          MergeRequest: true,
          Milestone: true
        },
        name: "sue445/example"
      };

      project_event = {
        title: "TestIssue",
        project_id: 15,
        action_name: "closed",
        target_id: 830,
        target_type: "Issue",
        created_at: "2015-12-04T10:33:58.089Z",
        author_id: 1,
        data: null,
        target_title: "Public project search field",
        author: {
          name: "Dmitriy Zaporozhets",
          username: "root",
          id: 1,
          state: "active",
          avatar_url: "http://localhost:3000/uploads/user/avatar/1/fox_avatar.png",
          web_url: "http://localhost:3000/root"
        },
        author_username: "root"
      };

      internal = {
        target_id: 830,
        target_url: "http://example.com/sue445/example/issue/830",
      };

      current_time = new Date();
      message = "[Issue] #445 TestIssue closed";
      author_id = 1;
    });

    context("When already notified", () => {
      beforeEach(() => {
        notification_cache.add(project_event);
      });

      it("should return false", () => {
        const result = notification.notify({
          project:       project,
          project_event: project_event,
          internal:      internal,
          current_time:  current_time,
          message:       message,
          author_id:     author_id
        });

        assert(!result);
      });
    });

    context("When ignoring own events", () => {
      beforeEach(() => {
        notification.config.ignoreOwnEvents = true;
      });

      it("should return false when author matches to the current user", () => {
        notification.config.userId = author_id;
        const result = notification.notify({
          project:       project,
          project_event: project_event,
          internal:      internal,
          current_time:  current_time,
          message:       message,
          author_id:     author_id
        });

        assert(!result);
      });

      it("should send notification when author NOT matches to the current user", () => {
        notification.config.userId = -1;
        const result = notification.notify({
          project:       project,
          project_event: project_event,
          internal:      internal,
          current_time:  current_time,
          message:       message,
          author_id:     author_id
        });

        assert(result);
        assert(chrome.notifications.create.calledOnce);
      });
    });

    context("When NOT ignoring own events", () => {
      beforeEach(() => {
        notification.config.ignoreOwnEvents = false;
      });

      [true, false].forEach(is_self_action =>
        it(`should send notification when (author==currentUser equals ${is_self_action})`, () => {
          notification.config.userId = is_self_action ? author_id : -1;

          const result = notification.notify({
            project:       project,
            project_event: project_event,
            internal:      internal,
            current_time:  current_time,
            message:       message,
            author_id:     author_id
          });

          assert(result);
          assert(chrome.notifications.create.calledOnce);
        }));
    });

    context("When not notified", () => {
      it("works", () => {
        const result = notification.notify({
          project:       project,
          project_event: project_event,
          internal:      internal,
          current_time:  current_time,
          message:       message,
          author_id:     author_id
        });

        assert(result);

        const cache_key = notification_cache.cacheKey(project_event);
        assert(JSON.parse(strage["notificationCache"])[cache_key] == true);

        const notification_id = JSON.stringify({
          notification_id: cache_key,
          target_url: "http://example.com/sue445/example/issue/830"
        });
        const notification_options = {
          type: "basic",
          iconUrl: "https://gitlab.com/uploads/project/avatar/219579/image.jpg",
          title: "sue445/example",
          message: "[Issue] #445 TestIssue closed",
          priority: 0,
        };
        assert(chrome.notifications.create.calledWith(notification_id, notification_options));

        const expect_project_event = {
          _id: cache_key,
          project_name: "sue445/example",
          target_id: 830,
          target_url: "http://example.com/sue445/example/issue/830",
          notified_at: current_time,
          message: "[Issue] #445 TestIssue closed",
          author_id: 1,
        };
        Object.assign(expect_project_event, project_event);
        assert.deepEqual(histories, [expect_project_event]);

        assert(notification.notification_count == 1);
        assert(chrome.browserAction.setBadgeText.calledWith({text: "1"}));
      });
    });
  });

  describe("#sanitizeUrl()", () => {
    it("should be sanitized", () => {
      assert(notification.sanitizeUrl("https://example.com/namespace/repo/")                        == "https://example.com/namespace/repo/");
      assert(notification.sanitizeUrl("https://example.com//namespace/repo/")                       == "https://example.com/namespace/repo/");
      assert(notification.sanitizeUrl("http://example.com//namespace/repo/")                        == "http://example.com/namespace/repo/");
      assert(notification.sanitizeUrl("https://example.com//namespace/repo/issues/1#note_12345678") == "https://example.com/namespace/repo/-/issues/1#note_12345678");
    });
  });
});
