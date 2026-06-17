#!/usr/bin/env python
# -*- coding: utf-8 -*-

import rospy
import json
from std_msgs.msg import String
from nav_msgs.msg import OccupancyGrid
from geometry_msgs.msg import Polygon, Point32

class HRZCostmapNode:
    def __init__(self):
        rospy.init_node('hrz_costmap_node', anonymous=True)
        self.zones = []
        self.costmap_pub = rospy.Publisher('/hrz_costmap', OccupancyGrid, queue_size=1)
        rospy.Subscriber('/hrz_zones', String, self.zones_callback)
        rospy.loginfo('HRZ Costmap Node started')

    def zones_callback(self, msg):
        try:
            data = json.loads(msg.data)
            self.zones = data
            rospy.loginfo('Received %d HRZ zones', len(data))
            self.publish_costmap_update()
        except Exception as e:
            rospy.logerr('Failed to parse HRZ zones: %s', str(e))

    def publish_costmap_update(self):
        if not self.zones:
            return
        rospy.loginfo('Publishing costmap update for %d zones', len(self.zones))

    def run(self):
        rospy.spin()

if __name__ == '__main__':
    try:
        node = HRZCostmapNode()
        node.run()
    except rospy.ROSInterruptException:
        pass
