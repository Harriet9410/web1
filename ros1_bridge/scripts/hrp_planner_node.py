#!/usr/bin/env python
# -*- coding: utf-8 -*-

import rospy
from std_msgs.msg import String
from nav_msgs.msg import Path
from geometry_msgs.msg import PoseStamped

class HRPPlannerNode:
    def __init__(self):
        rospy.init_node('hrp_planner_node', anonymous=True)
        self.current_path = None
        self.path_pub = rospy.Publisher('/hrp_global_plan', Path, queue_size=1)
        rospy.Subscriber('/hrp_path', Path, self.path_callback)
        rospy.loginfo('HRP Planner Node started')

    def path_callback(self, msg):
        self.current_path = msg
        rospy.loginfo('Received HRP path with %d poses', len(msg.poses))
        self.make_plan()

    def make_plan(self):
        if not self.current_path:
            return
        try:
            robot_pose = self.get_robot_pose()
            if robot_pose:
                prepend = PoseStamped()
                prepend.header.frame_id = 'map'
                prepend.pose = robot_pose.pose.pose
                self.current_path.poses.insert(0, prepend)
            self.path_pub.publish(self.current_path)
            rospy.loginfo('Published global plan with %d poses', len(self.current_path.poses))
        except Exception as e:
            rospy.logerr('Failed to make plan: %s', str(e))

    def get_robot_pose(self):
        try:
            from nav_msgs.msg import Odometry
            msg = rospy.wait_for_message('/odom', Odometry, timeout=2.0)
            return msg
        except:
            return None

    def run(self):
        rospy.spin()

if __name__ == '__main__':
    try:
        node = HRPPlannerNode()
        node.run()
    except rospy.ROSInterruptException:
        pass
